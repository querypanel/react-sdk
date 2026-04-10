import { describe, expect, mock, test, beforeEach } from "bun:test";

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

// Mock OpenAI embeddings — returns a deterministic vector
mock.module("@langchain/openai", () => ({
	OpenAIEmbeddings: class {
		async embedQuery() {
			return new Array(1536).fill(0.01);
		}
	},
}));

// Helper to build RPC result rows
function makeRow(
	type: string,
	id: number,
	content: string,
	score: number,
	extra: Record<string, unknown> = {},
) {
	return {
		id,
		content,
		metadata: { type, target_identifier: `${type}-${id}`, ...extra },
		score,
	};
}

const defaultRpcImplementation = async (
	_funcName: string,
	params: { filter?: Record<string, unknown> },
) => {
	const type = params.filter?.type;

	if (type === "table_overview") {
		return {
			data: [
				makeRow("table_overview", 1, "Table: orders", 0.03, {
					table: "orders",
					dialect: "postgres",
					database: "analytics",
				}),
			],
			error: null,
		};
	}
	if (type === "column") {
		return {
			data: [
				makeRow("column", 10, "Column: orders.id", 0.025, {
					table: params.filter?.table ?? "orders",
				}),
				makeRow("column", 11, "Column: orders.total", 0.02, {
					table: params.filter?.table ?? "orders",
				}),
			],
			error: null,
		};
	}
	if (type === "gold_sql") {
		return {
			data: [
				makeRow("gold_sql", 20, "SELECT id FROM orders", 0.018),
			],
			error: null,
		};
	}
	if (type === "glossary") {
		return {
			data: [
				makeRow("glossary", 30, "Revenue means total sales", 0.015),
			],
			error: null,
		};
	}
	return { data: [], error: null };
};

// Set up the Supabase RPC mock — dispatches based on filter.type
const mockRpc = mock(defaultRpcImplementation);

mock.module("../../src/lib/supabase", () => ({
	supabase: { rpc: mockRpc },
}));

import { HybridRetrieverService } from "../../src/services/v2/hybrid-retriever.service";

const mockSchemaStorage = {
	getLatestSchema: mock(async () => null),
} as any;

describe("HybridRetrieverService", () => {
	beforeEach(() => {
		mockRpc.mockClear();
		mockRpc.mockImplementation(defaultRpcImplementation);
		mockSchemaStorage.getLatestSchema.mockClear();
	});

	test("retrieveTableOverview returns top table content", async () => {
		const service = new HybridRetrieverService(mockSchemaStorage);

		const result = await service.retrieveTableOverview("orders", "org-1");

		expect(result).toBe("Table: orders");
		expect(mockRpc).toHaveBeenCalledTimes(1);
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "orders",
			query_embedding: expect.any(Array),
			filter: { organization_id: "org-1", type: "table_overview" },
			match_count: 1,
		});
	});

	test("retrieveTableOverview passes database and dialect filters", async () => {
		const service = new HybridRetrieverService(mockSchemaStorage);

		await service.retrieveTableOverview("orders", "org-1", "mydb", "clickhouse");

		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "orders",
			query_embedding: expect.any(Array),
			filter: {
				organization_id: "org-1",
				type: "table_overview",
				database: "mydb",
				dialect: "clickhouse",
			},
			match_count: 1,
		});
	});

	test("retrieveTableOverview returns undefined when no results", async () => {
		mockRpc.mockResolvedValueOnce({ data: [], error: null });

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTableOverview("unknown", "org-1");

		expect(result).toBeUndefined();
	});

	test("retrieveTwoPass identifies candidate tables and scopes columns", async () => {
		const service = new HybridRetrieverService(mockSchemaStorage);

		const result = await service.retrieveTwoPass(
			"show order totals",
			"org-1",
		);

		// Pass 1: table_overview search
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "show order totals",
			query_embedding: expect.any(Array),
			filter: { organization_id: "org-1", type: "table_overview" },
			match_count: 3,
		});

		// Pass 2: column search scoped to "orders" table
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "show order totals",
			query_embedding: expect.any(Array),
			filter: { organization_id: "org-1", type: "column", table: "orders" },
			match_count: 8,
		});

		// Pass 2: gold_sql and glossary (no table scope)
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "show order totals",
			query_embedding: expect.any(Array),
			filter: { organization_id: "org-1", type: "gold_sql" },
			match_count: 5,
		});
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", {
			query_text: "show order totals",
			query_embedding: expect.any(Array),
			filter: { organization_id: "org-1", type: "glossary" },
			match_count: 3,
		});

		// Result shape
		expect(result.primaryTable).toBe("orders");
		expect(result.dialect).toBe("postgres");
		expect(result.database).toBe("analytics");
		expect(result.chunks.length).toBeGreaterThan(0);

		// Should contain all chunk types
		const types = new Set(result.chunks.map((c) => c.source));
		expect(types.has("table_overview")).toBe(true);
		expect(types.has("column")).toBe(true);
		expect(types.has("gold_sql")).toBe(true);
		expect(types.has("glossary")).toBe(true);
	});

	test("retrieveTwoPass with multiple candidate tables scopes columns per table", async () => {
		// Override mock to return 2 tables in pass 1
		mockRpc.mockImplementation(
			async (_funcName: string, params: { filter?: Record<string, unknown> }) => {
				const type = params.filter?.type;
				if (type === "table_overview") {
					return {
						data: [
							makeRow("table_overview", 1, "Table: orders", 0.03, {
								table: "orders",
								dialect: "postgres",
								database: "analytics",
							}),
							makeRow("table_overview", 2, "Table: customers", 0.025, {
								table: "customers",
								dialect: "postgres",
								database: "analytics",
							}),
						],
						error: null,
					};
				}
				if (type === "column") {
					const table = params.filter?.table;
					return {
						data: [
							makeRow("column", table === "orders" ? 10 : 20, `Column: ${table}.id`, 0.02, { table }),
						],
						error: null,
					};
				}
				return { data: [], error: null };
			},
		);

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("show data", "org-1");

		// Should have scoped column searches for both tables
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", expect.objectContaining({
			filter: expect.objectContaining({ type: "column", table: "orders" }),
		}));
		expect(mockRpc).toHaveBeenCalledWith("hybrid_search_chunks", expect.objectContaining({
			filter: expect.objectContaining({ type: "column", table: "customers" }),
		}));

		// Total calls: 1 (table overview) + 2 (columns per table) + 2 (gold_sql + glossary) = 5
		expect(mockRpc).toHaveBeenCalledTimes(5);

		expect(result.primaryTable).toBe("orders");
	});

	test("retrieveTwoPass handles no tables gracefully", async () => {
		mockRpc.mockResolvedValueOnce({ data: [], error: null });

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("unknown query", "org-1");

		expect(result.primaryTable).toBeUndefined();
		expect(result.chunks).toHaveLength(2);
		expect(new Set(result.chunks.map((c) => c.source))).toEqual(
			new Set(["gold_sql", "glossary"]),
		);

		// Pass 1 + fallback gold_sql + fallback glossary
		expect(mockRpc).toHaveBeenCalledTimes(3);
	});

	test("retrieveTwoPass handles RPC errors gracefully", async () => {
		mockRpc.mockResolvedValue({
			data: null,
			error: { message: "DB connection failed" },
		});

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("orders", "org-1");

		// Should not throw, returns empty result
		expect(result.primaryTable).toBeUndefined();
		expect(result.chunks).toHaveLength(0);
	});

	test("retrieveTwoPass falls back to gold_sql table metadata when table_overview is empty", async () => {
		mockRpc.mockImplementation(
			async (_funcName: string, params: { filter?: Record<string, unknown> }) => {
				const type = params.filter?.type;
				if (type === "table_overview") {
					return { data: [], error: null };
				}
				if (type === "gold_sql") {
					return {
						data: [
							makeRow("gold_sql", 20, "SELECT id FROM orders", 0.02, {
								table: "orders",
								dialect: "postgres",
								database: "analytics",
							}),
						],
						error: null,
					};
				}
				if (type === "column") {
					return {
						data: [
							makeRow("column", 10, "Column: orders.id", 0.01, {
								table: "orders",
							}),
						],
						error: null,
					};
				}
				return { data: [], error: null };
			},
		);

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("show orders", "org-1");

		expect(result.primaryTable).toBe("orders");
		expect(result.dialect).toBe("postgres");
		expect(result.database).toBe("analytics");
		expect(result.chunks.some((c) => c.source === "gold_sql")).toBe(true);
		expect(result.chunks.some((c) => c.source === "column")).toBe(true);

		expect(mockRpc).toHaveBeenCalledWith(
			"hybrid_search_chunks",
			expect.objectContaining({
				filter: expect.objectContaining({
					type: "column",
					table: "orders",
				}),
			}),
		);
	});

	test("retrieveTwoPass fetches tenant settings", async () => {
		mockSchemaStorage.getLatestSchema.mockResolvedValueOnce({
			tenant_settings: {
				tenantFieldName: "org_id",
				enforceTenantIsolation: true,
			},
		});

		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("orders", "org-1");

		expect(result.tenantSettings).toEqual({
			tenantFieldName: "org_id",
			enforceTenantIsolation: true,
		});
		expect(mockSchemaStorage.getLatestSchema).toHaveBeenCalledWith(
			"org-1",
			"analytics",
		);
	});

	test("chunks have correct source and score from RPC", async () => {
		const service = new HybridRetrieverService(mockSchemaStorage);
		const result = await service.retrieveTwoPass("show orders", "org-1");

		const tableChunk = result.chunks.find((c) => c.source === "table_overview");
		expect(tableChunk).toBeDefined();
		expect(tableChunk!.score).toBe(0.03);
		expect(tableChunk!.pageContent).toBe("Table: orders");

		const colChunk = result.chunks.find((c) => c.source === "column");
		expect(colChunk).toBeDefined();
		expect(colChunk!.score).toBeGreaterThan(0);
	});
});
