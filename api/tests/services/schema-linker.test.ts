import { describe, expect, mock, test } from "bun:test";

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

// Mock the ai module's generateObject
mock.module("ai", () => ({
	generateObject: mock(async () => ({
		object: {
			linkedEntities: [
				{
					mention: "orders",
					table: "orders",
					column: undefined,
					reasoning: "Direct table name match",
				},
				{
					mention: "customer_id",
					table: "orders",
					column: "customer_id",
					reasoning: "Direct column match in orders table",
				},
			],
			resolvedTables: ["orders"],
			prunedChunkIds: ["unrelated-chunk-1"],
			joinHints: [],
		},
	})),
}));

mock.module("@ai-sdk/openai", () => ({
	openai: mock(() => "mock-model"),
}));

import { linkSchema, applyPruning } from "../../src/services/v2/schema-linker.service";
import type { ContextChunk } from "../../src/types/query";

describe("linkSchema", () => {
	test("returns linked entities, resolved tables, and pruned chunk IDs", async () => {
		const result = await linkSchema({
			question: "Show me orders for customer_id 123",
			contextChunks: [
				{
					source: "table_overview",
					pageContent: "Table: orders - Contains order data",
					metadata: {
						table: "orders",
						target_identifier: "db:orders:table_overview",
					},
				},
				{
					source: "column",
					pageContent: "Column: orders.customer_id",
					metadata: {
						table: "orders",
						column: "customer_id",
						target_identifier: "db:orders:column:customer_id",
					},
				},
			],
		});

		expect(result.linkedEntities).toHaveLength(2);
		expect(result.resolvedTables).toContain("orders");
		expect(result.prunedChunkIds).toHaveLength(1);
	});

	test("accepts intent tables and operations", async () => {
		const result = await linkSchema({
			question: "Show me orders",
			contextChunks: [],
			intentTables: ["orders"],
			intentOperations: ["SELECT"],
		});

		expect(result).toBeDefined();
		expect(result.linkedEntities).toBeDefined();
	});
});

describe("applyPruning", () => {
	const chunks: ContextChunk[] = [
		{
			source: "table_overview",
			pageContent: "Table: orders",
			metadata: { target_identifier: "orders-overview" },
		},
		{
			source: "column",
			pageContent: "Column: users.email",
			metadata: { target_identifier: "unrelated-chunk-1" },
		},
		{
			source: "column",
			pageContent: "Column: orders.total",
			metadata: { target_identifier: "orders-total" },
		},
		{
			source: "glossary",
			pageContent: "Revenue means total",
			metadata: {}, // no target_identifier — should be kept
		},
	];

	test("removes pruned chunks by target_identifier", () => {
		const result = applyPruning(chunks, {
			linkedEntities: [],
			resolvedTables: ["orders"],
			prunedChunkIds: ["unrelated-chunk-1"],
		});

		expect(result).toHaveLength(3);
		expect(result.find((c) => c.metadata.target_identifier === "unrelated-chunk-1")).toBeUndefined();
	});

	test("keeps chunks without target_identifier", () => {
		const result = applyPruning(chunks, {
			linkedEntities: [],
			resolvedTables: ["orders"],
			prunedChunkIds: ["unrelated-chunk-1"],
		});

		const glossary = result.find((c) => c.source === "glossary");
		expect(glossary).toBeDefined();
	});

	test("returns all chunks when prunedChunkIds is empty", () => {
		const result = applyPruning(chunks, {
			linkedEntities: [],
			resolvedTables: ["orders"],
			prunedChunkIds: [],
		});

		expect(result).toHaveLength(4);
	});

	test("returns all chunks when none match pruned IDs", () => {
		const result = applyPruning(chunks, {
			linkedEntities: [],
			resolvedTables: ["orders"],
			prunedChunkIds: ["nonexistent-id"],
		});

		expect(result).toHaveLength(4);
	});
});
