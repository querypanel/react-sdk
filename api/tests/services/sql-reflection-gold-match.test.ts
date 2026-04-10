import { beforeEach, describe, expect, mock, test } from "bun:test";

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
			schemaLinker: "gpt-4o-mini",
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

import { reflectOnSql } from "../../src/services/v2/sql-reflection.service";

describe("reflectOnSql gold_sql exact-match prompting", () => {
	beforeEach(() => {
		mockGenerateObject.mockClear();
	});

	test("does not mark short generic overlap as exact", async () => {
		await reflectOnSql({
			question: "orders",
			sql: "SELECT id FROM orders LIMIT 100",
			params: [],
			contextChunks: [
				{
					source: "gold_sql",
					pageContent: "SELECT date_trunc('month', created_at) AS month FROM orders",
					metadata: { entry_name: "orders by month", table: "orders" },
				},
			],
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.not.stringContaining("EXACT MATCH"),
			}),
		);
	});

	test("marks strong multi-word alignment as exact", async () => {
		await reflectOnSql({
			question: "monthly revenue by country",
			sql: "SELECT country, SUM(amount) FROM orders GROUP BY country LIMIT 100",
			params: [],
			contextChunks: [
				{
					source: "gold_sql",
					pageContent: "SELECT country, month, SUM(amount) FROM orders",
					metadata: { entry_name: "country monthly revenue", table: "orders" },
				},
			],
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("EXACT MATCH"),
			}),
		);
	});
});
