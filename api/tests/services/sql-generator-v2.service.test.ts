import { beforeEach, describe, expect, mock, test } from "bun:test";

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
		sql: "SELECT id FROM orders LIMIT 100",
		params: [],
		rationale: "Use orders table.",
	},
}));

mock.module("ai", () => ({
	generateObject: mockGenerateObject,
}));

mock.module("@ai-sdk/openai", () => ({
	openai: mock(() => "mock-model"),
}));

import { SqlGeneratorV2Service } from "../../src/services/v2/sql-generator-v2.service";

describe("SqlGeneratorV2Service gold_sql exact-match prompting", () => {
	beforeEach(() => {
		mockGenerateObject.mockClear();
	});

	test("does not trigger EXACT MATCH for short generic question", async () => {
		const service = new SqlGeneratorV2Service();

		await service.generate({
			question: "orders",
			contextChunks: [
				{
					source: "gold_sql",
					pageContent: "SQL:\nSELECT date_trunc('month', created_at) AS month FROM orders",
					metadata: {
						entry_name: "orders by month",
						table: "orders",
					},
				},
			],
			dialect: "postgres",
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.not.stringContaining("(EXACT MATCH)"),
			}),
		);
	});

	test("triggers EXACT MATCH for strong multi-word alignment", async () => {
		const service = new SqlGeneratorV2Service();

		await service.generate({
			question: "monthly revenue by country",
			contextChunks: [
				{
					source: "gold_sql",
					pageContent: "SQL:\nSELECT country, date_trunc('month', created_at) AS month, sum(amount) FROM orders GROUP BY 1,2",
					metadata: {
						entry_name: "country monthly revenue",
						table: "orders",
					},
				},
			],
			dialect: "postgres",
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("(EXACT MATCH)"),
			}),
		);
	});

	test("includes available time columns in the generation prompt when provided", async () => {
		const service = new SqlGeneratorV2Service();

		await service.generate({
			question: "Show orders from last week",
			contextChunks: [
				{
					source: "column",
					pageContent: "Column: orders.created_at\nType: DateTime\nTable: orders",
					metadata: {
						table: "orders",
						column: "created_at",
						data_type: "DateTime",
					},
				},
			],
			dialect: "postgres",
			timeColumns: ["created_at", "processed_at"],
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining(
					"## Available Date/Time Columns\ncreated_at, processed_at",
				),
			}),
		);
	});
});

describe("SqlGeneratorV2Service dialect instructions", () => {
	test("uses named parameters for bigquery", async () => {
		const service = new SqlGeneratorV2Service();

		await service.generate({
			question: "show active users",
			contextChunks: [],
			dialect: "bigquery",
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("Use BigQuery Standard SQL syntax."),
			}),
		);
		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("@tenant_id"),
			}),
		);
		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("NEVER use $1, $2, ?, or {name:Type} placeholders."),
			}),
		);
		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining(
					"When querying a single table without an alias in FROM, reference columns unqualified",
				),
			}),
		);
	});

	test("includes available time columns in generation prompt", async () => {
		const service = new SqlGeneratorV2Service();

		await service.generate({
			question: "show repositories over time",
			contextChunks: [],
			dialect: "bigquery",
			timeColumns: ["repository_created_at", "created_at"],
		});

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("## Available Date/Time Columns"),
			}),
		);
		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("repository_created_at, created_at"),
			}),
		);
	});
});
