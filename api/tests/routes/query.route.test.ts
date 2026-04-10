import { describe, expect, mock, test } from "bun:test";

// Mock config
mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: {
			url: "https://test.supabase.co",
			serviceRoleKey: "test-key",
		},
		openai: {
			apiKey: "test-key",
		},
		mastra: {
			databaseUrl: "postgresql://test:test@localhost:5432/test",
			postgresPoolMax: 5,
			postgresIdleTimeoutMillis: 5000,
		},
		models: {
			sqlGenerator: "gpt-4o-mini",
			chartGenerator: "gpt-4o-mini",
			guardrail: "gpt-4o-mini",
			moderation: "omni-moderation-latest",
		},
		autoEval: {
			enabled: false,
			sampleRate: 0.05,
			judgeModel: "gpt-4o-mini",
			timeoutMs: undefined,
		},
		database: {
			tableName: "schema_chunks",
			queryName: "match_documents",
		},
		auth: {
			serviceApiKey: "test-api-key",
		},
		langfuse: {
			publicKey: undefined,
			secretKey: undefined,
			host: undefined,
			enabled: false,
		},
	},
}));

import { Hono } from "hono";
import { registerQueryRoutes } from "../../src/routes/query.route";
import { GuardrailError } from "../../src/services/guardrail.service";
import { ModerationError } from "../../src/services/moderation.service";
import type { AppContext } from "../../src/types/app";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (runImpl: ReturnType<typeof mock>) => {
	const app = new Hono<AppContext>();
	// Use test auth middleware to set auth context
	app.use("*", createTestAuthMiddleware());
	registerQueryRoutes(app, {
		queryRunner: { run: runImpl } as any,
		sqlLogService: {
			createDraftLog: mock(async () => "test-query-id"),
			createFailedLog: mock(async () => "test-failed-id"),
		} as any,
		sessionService: {
			getRecentTurns: mock(async () => []),
			addTurn: mock(async () => undefined),
		} as any,
	});
	return app;
};

describe("POST /query", () => {
	test("returns SQL from runner", async () => {
		const mockRun = mock(async () => ({
			sql: "SELECT * FROM orders",
			params: [],
			dialect: "clickhouse",
			rationale: "demo",
			context: [],
		}));

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show table orders",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.sql).toBe("SELECT * FROM orders");
		// In development mode, auth context uses default org and tenant IDs
		expect(mockRun).toHaveBeenCalledWith(
			"Show table orders",
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"3",
			undefined,
			undefined,
			undefined, // callbacks (undefined when langfuse disabled in tests)
			undefined,
			undefined,
			undefined,
			[],
		);
	});

	test("returns 400 for guardrail errors", async () => {
		const mockRun = mock(async () => {
			throw new GuardrailError(
				"Question is not related to database querying",
				"irrelevant",
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "weather?",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBeDefined();
		expect(body.details).toBeDefined();
		expect(body.details.threat_type).toBe("irrelevant");
	});

	test("returns 400 for SQL injection guardrail errors", async () => {
		const mockRun = mock(async () => {
			throw new GuardrailError(
				"Question contains SQL injection patterns",
				"sql_injection",
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show users; DROP TABLE users--",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toContain("SQL injection");
		expect(body.details.threat_type).toBe("sql_injection");
	});

	test("returns 400 for moderation errors", async () => {
		const mockRun = mock(async () => {
			throw new ModerationError(
				"Content violates usage policies. Flagged categories: violence",
				{ violence: true, hate: false } as any,
				{ violence: 0.95, hate: 0.01 } as any,
				true,
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "violent content",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toContain("violates usage policies");
		expect(body.details).toBeDefined();
		expect(body.details.flagged).toBe(true);
		expect(body.details.categories).toContain("violence");
	});

	test("returns 400 for moderation errors with multiple categories", async () => {
		const mockRun = mock(async () => {
			throw new ModerationError(
				"Content violates usage policies",
				{ violence: true, hate: true, sexual: false } as any,
				{ violence: 0.9, hate: 0.85, sexual: 0.01 } as any,
				true,
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "bad content",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.details.categories).toContain("violence");
		expect(body.details.categories).toContain("hate");
		expect(body.details.categories).not.toContain("sexual");
	});

	test("returns 500 for other errors", async () => {
		const mockRun = mock(async () => {
			throw new Error("Database connection failed");
		});

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show users",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Database connection failed");
	});

	test("accepts repair parameters", async () => {
		const mockRun = mock(async () => ({
			sql: "SELECT id, name FROM users",
			params: [],
			dialect: "postgres",
			rationale: "Fixed query",
			context: [],
		}));

		const app = createApp(mockRun);

		const res = await app.request("/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show users",
				last_error: "column 'email' does not exist",
				previous_sql: "SELECT email FROM users",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		// In development mode, auth context uses default org and tenant IDs
		expect(mockRun).toHaveBeenCalledWith(
			"Show users",
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"3",
			"column 'email' does not exist",
			"SELECT email FROM users",
			undefined, // callbacks (undefined when langfuse disabled in tests)
			undefined,
			undefined,
			undefined,
			[],
		);
	});
});
