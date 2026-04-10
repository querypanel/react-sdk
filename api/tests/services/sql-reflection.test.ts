import { describe, expect, mock, test } from "bun:test";

mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: { url: "https://test.supabase.co", serviceRoleKey: "test-key" },
		openai: { apiKey: "test-key" },
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
		autoEval: { enabled: false, sampleRate: 0.05, judgeModel: "gpt-4o-mini" },
		database: { tableName: "schema_chunks", queryName: "match_documents" },
		auth: { serviceApiKey: "test-api-key" },
		langfuse: { enabled: false },
	},
}));

const mockGenerateObject = mock(async () => ({
	object: {
		isCorrect: true,
		issues: [],
		correctedSql: undefined,
		correctedParams: undefined,
		correctedRationale: undefined,
	},
}));

mock.module("ai", () => ({
	generateObject: mockGenerateObject,
}));

mock.module("@ai-sdk/openai", () => ({
	openai: mock(() => "mock-model"),
}));

import { reflectOnSql, applyReflection, type ReflectionResult } from "../../src/services/v2/sql-reflection.service";
import type { GeneratedQuery } from "../../src/types/query";

describe("reflectOnSql", () => {
	test("returns reflection result for correct SQL", async () => {
		const result = await reflectOnSql({
			question: "Show orders count",
			sql: "SELECT COUNT(*) FROM orders LIMIT 100",
			params: [],
			contextChunks: [
				{
					source: "table_overview",
					pageContent: "Table: orders - Contains order data",
					metadata: { table: "orders" },
				},
			],
		});

		expect(result.isCorrect).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	test("passes schema linking context when provided", async () => {
		await reflectOnSql({
			question: "Show orders by customer",
			sql: "SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id LIMIT 100",
			params: [],
			contextChunks: [],
			schemaLinking: {
				linkedEntities: [
					{ mention: "orders", table: "orders", reasoning: "direct match" },
					{ mention: "customer", table: "orders", column: "customer_id", reasoning: "column match" },
				],
				resolvedTables: ["orders"],
				prunedChunkIds: [],
				joinHints: [],
			},
		});

		expect(mockGenerateObject).toHaveBeenCalled();
	});

	test("passes tenant enforcement context when provided", async () => {
		await reflectOnSql({
			question: "Show orders",
			sql: "SELECT * FROM orders WHERE org_id = $1 LIMIT 100",
			params: [{ name: "org_id", value: "tenant-1" }],
			contextChunks: [],
			tenantFieldName: "org_id",
			enforceTenantIsolation: true,
		});

		expect(mockGenerateObject).toHaveBeenCalled();
	});

	test("adds BigQuery dialect safety guidance when reflecting BigQuery SQL", async () => {
		await reflectOnSql({
			question: "Show repositories over time",
			sql: "SELECT created_at FROM github_timeline LIMIT 100",
			params: [],
			contextChunks: [],
			dialect: "bigquery",
			tenantFieldName: "repository_organization",
			enforceTenantIsolation: true,
			timeColumns: ["repository_created_at", "created_at"],
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("NEVER use $1, $2, ?, {name:Type}, ILIKE, :: casts, or FROM_UNIXTIME()."),
			}),
		);
	});
});

describe("applyReflection", () => {
	const originalQuery: GeneratedQuery = {
		sql: "SELECT * FROM orders LIMIT 100",
		params: [],
		rationale: "Original rationale",
		dialect: "postgres",
	};

	test("returns original query when SQL is correct", () => {
		const reflection: ReflectionResult = {
			isCorrect: true,
			issues: [],
			correctedSql: undefined,
			correctedParams: undefined,
			correctedRationale: undefined,
		};

		const result = applyReflection(originalQuery, reflection);
		expect(result.sql).toBe("SELECT * FROM orders LIMIT 100");
		expect(result.rationale).toBe("Original rationale");
	});

	test("returns corrected query when reflection finds errors", () => {
		const reflection: ReflectionResult = {
			isCorrect: false,
			issues: [
				{
					severity: "error",
					description: "Missing WHERE clause",
					fix: "Add WHERE org_id = $1",
				},
			],
			correctedSql: "SELECT id, name FROM orders WHERE org_id = $1 LIMIT 100",
			correctedParams: [{ name: "org_id", value: "tenant-1" }],
			correctedRationale: "Added tenant filter",
		};

		const result = applyReflection(originalQuery, reflection);
		expect(result.sql).toBe("SELECT id, name FROM orders WHERE org_id = $1 LIMIT 100");
		expect(result.params).toEqual([{ name: "org_id", value: "tenant-1" }]);
		expect(result.rationale).toBe("Added tenant filter");
		expect(result.dialect).toBe("postgres"); // preserved from original
	});

	test("returns original when isCorrect is false but no correctedSql provided", () => {
		const reflection: ReflectionResult = {
			isCorrect: false,
			issues: [
				{ severity: "warning", description: "Minor issue" },
			],
			correctedSql: undefined,
			correctedParams: undefined,
			correctedRationale: undefined,
		};

		const result = applyReflection(originalQuery, reflection);
		expect(result.sql).toBe("SELECT * FROM orders LIMIT 100");
	});

	test("preserves original params when correctedParams not provided", () => {
		const queryWithParams: GeneratedQuery = {
			sql: "SELECT * FROM orders WHERE status = $1 LIMIT 100",
			params: [{ name: "status", value: "active" }],
			rationale: "Filter by status",
			dialect: "postgres",
		};

		const reflection: ReflectionResult = {
			isCorrect: false,
			issues: [{ severity: "error", description: "Wrong column" }],
			correctedSql: "SELECT id FROM orders WHERE status = $1 LIMIT 100",
			correctedParams: undefined,
			correctedRationale: "Fixed column selection",
		};

		const result = applyReflection(queryWithParams, reflection);
		expect(result.sql).toBe("SELECT id FROM orders WHERE status = $1 LIMIT 100");
		expect(result.params).toEqual([{ name: "status", value: "active" }]);
	});
});
