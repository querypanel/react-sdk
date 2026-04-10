import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";

mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: { url: "https://test.supabase.co", serviceRoleKey: "test-key" },
		openai: { apiKey: "test-key" },
		models: {
			sqlGenerator: "gpt-4o-mini",
			chartGenerator: "gpt-4o-mini",
			guardrail: "gpt-4o-mini",
			moderation: "omni-moderation-latest",
		},
		autoEval: { enabled: false, sampleRate: 0.05, judgeModel: "gpt-4o-mini" },
		database: { tableName: "schema_chunks", queryName: "match_documents" },
		auth: { serviceApiKey: "test-api-key" },
		langfuse: { enabled: false },
	},
}));

import {
	verifyTenantIsolation,
	TenantVerificationError,
	ensureTenantParam,
	validateDialectCompatibility,
	DialectCompatibilityError,
} from "../../src/services/v2/tenant-verification.service";

describe("verifyTenantIsolation", () => {
	const tenantSettings = {
		tenantFieldName: "org_id",
		tenantFieldType: "string" as const,
		enforceTenantIsolation: true,
	};

	test("passes when tenant filter is present with = operator", () => {
		const sql = "SELECT * FROM users WHERE org_id = $1 LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("passes when tenant filter is present with IN clause", () => {
		const sql = "SELECT * FROM users WHERE org_id IN ($1) LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("passes when tenant filter is present as qualified name", () => {
		const sql = "SELECT * FROM users WHERE users.org_id = $1 LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("passes when tenant filter is present with quoted identifier", () => {
		const sql = 'SELECT * FROM users WHERE "org_id" = $1 LIMIT 100';
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("passes when BigQuery tenant filter uses a backtick-quoted identifier path", () => {
		const sql =
			"SELECT COUNT(*) FROM `project.dataset.users` WHERE `users.org_id` = @org_id LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings, "bigquery"),
		).not.toThrow();
	});

	test("passes with ClickHouse placeholder", () => {
		const sql = "SELECT * FROM users WHERE org_id = {org_id:String} LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("throws TenantVerificationError when filter is missing", () => {
		const sql = "SELECT * FROM users WHERE status = 'active' LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).toThrow(TenantVerificationError);
	});

	test("error message contains field name", () => {
		const sql = "SELECT * FROM users LIMIT 100";
		try {
			verifyTenantIsolation(sql, "tenant-1", tenantSettings);
			expect(true).toBe(false); // should not reach here
		} catch (e) {
			expect(e).toBeInstanceOf(TenantVerificationError);
			expect((e as Error).message).toContain("org_id");
		}
	});

	test("skips check when enforcement is disabled", () => {
		const sql = "SELECT * FROM users LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", {
				...tenantSettings,
				enforceTenantIsolation: false,
			}),
		).not.toThrow();
	});

	test("skips check when tenantId is undefined", () => {
		const sql = "SELECT * FROM users LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, undefined, tenantSettings),
		).not.toThrow();
	});

	test("skips check when tenantSettings is undefined", () => {
		const sql = "SELECT * FROM users LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", undefined),
		).not.toThrow();
	});

	test("skips check when fieldName is not set", () => {
		const sql = "SELECT * FROM users LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", {
				tenantFieldName: "",
				tenantFieldType: "string",
				enforceTenantIsolation: true,
			}),
		).not.toThrow();
	});

	test("handles case-insensitive matching", () => {
		const sql = "SELECT * FROM users WHERE ORG_ID = $1 LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("handles whitespace variations", () => {
		const sql = "SELECT * FROM users WHERE org_id   =   $1 LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings),
		).not.toThrow();
	});

	test("rejects positional tenant placeholder for BigQuery", () => {
		const sql = "SELECT * FROM users WHERE org_id = $1 LIMIT 100";
		expect(() =>
			verifyTenantIsolation(sql, "tenant-1", tenantSettings, "bigquery"),
		).toThrow(TenantVerificationError);
	});
});

describe("ensureTenantParam", () => {
	test("adds missing BigQuery tenant param when named placeholder is present", () => {
		const generated = ensureTenantParam(
			{
				sql: "SELECT * FROM users WHERE org_id = @org_id LIMIT 100",
				params: [],
				dialect: "bigquery",
			},
			"tenant-1",
			{
				tenantFieldName: "org_id",
				tenantFieldType: "string",
				enforceTenantIsolation: true,
			},
		);

		expect(generated.params).toEqual([
			{ name: "org_id", value: "tenant-1", description: "Tenant isolation filter" },
		]);
	});
});

describe("validateDialectCompatibility", () => {
	test("rejects positional placeholders for BigQuery", () => {
		expect(() =>
			validateDialectCompatibility({
				sql: "SELECT * FROM users WHERE org_id = $1 LIMIT 100",
				params: [],
				dialect: "bigquery",
			}),
		).toThrow(DialectCompatibilityError);
	});

	test("rejects FROM_UNIXTIME for BigQuery", () => {
		expect(() =>
			validateDialectCompatibility({
				sql: "SELECT DATE(FROM_UNIXTIME(123)) LIMIT 100",
				params: [],
				dialect: "bigquery",
			}),
		).toThrow(DialectCompatibilityError);
	});

	test("allows valid BigQuery named parameters", () => {
		expect(() =>
			validateDialectCompatibility({
				sql: "SELECT * FROM users WHERE org_id = @org_id LIMIT 100",
				params: [{ name: "org_id", value: "tenant-1" }],
				dialect: "bigquery",
			}),
		).not.toThrow();
	});
});
