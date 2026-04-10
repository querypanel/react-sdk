import "./helpers/config.helper";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Hono } from "hono";
import { createApp, createAppWithMastra } from "../src/app";
import type { AppContext } from "../src/types/app";
import { createTestAuthMiddleware } from "./helpers/auth.helper";

// API key for test requests
const TEST_API_KEY = "test-api-key-123";

// Mock instrumentation (loaded first in src/index.ts)
mock.module("../src/lib/instrumentation", () => ({
	initializeInstrumentation: () => {},
}));

// Mock OpenAI for embedding/chat services
mock.module("@langchain/openai", () => ({
	OpenAIEmbeddings: class {
		constructor() {}
	},
	ChatOpenAI: class {
		constructor() {}
		withStructuredOutput() {
			return {
				invoke: async () => ({
					spec: {
						version: "1.0",
						kind: "chart",
						title: "Test Chart",
						data: { sourceId: "main_query" },
						encoding: {
							chartType: "bar",
							x: { field: "month", type: "temporal" },
							y: { field: "revenue", type: "quantitative" },
						},
					},
					notes: "Test notes",
				}),
			};
		}
	},
}));

// Mock SupabaseVectorStore for embedding service
const mockFromDocuments = mock(async () => {});
const mockSimilaritySearch = mock(async () => []);
const mockFromExistingIndex = mock(async () => ({
	similaritySearch: mockSimilaritySearch,
}));

mock.module("@langchain/community/vectorstores/supabase", () => ({
	SupabaseVectorStore: {
		fromDocuments: mockFromDocuments,
		fromExistingIndex: mockFromExistingIndex,
	},
}));

// Mock Supabase client with proper chain methods
const mockSelect = mock();
const mockInsert = mock();
const mockEq = mock();
const mockIn = mock();
const mockContains = mock();
const mockOrder = mock();
const mockLimit = mock();
const mockMaybeSingle = mock();
const mockSingle = mock();

const mockQuery: any = {
	select: mockSelect,
	insert: mockInsert,
	eq: mockEq,
	in: mockIn,
	contains: mockContains,
	order: mockOrder,
	limit: mockLimit,
	maybeSingle: mockMaybeSingle,
	single: mockSingle,
};

// Setup the mock functions to return mockQuery for chaining
mockSelect.mockReturnValue(mockQuery);
mockInsert.mockReturnValue(mockQuery);
mockEq.mockReturnValue(mockQuery);
mockContains.mockReturnValue(mockQuery);
mockIn.mockResolvedValue({ data: [], error: null });
mockOrder.mockReturnValue(mockQuery);
mockLimit.mockReturnValue(mockQuery);

const mockFrom = mock(() => mockQuery);

mock.module("../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

let app: Hono<AppContext>;

beforeAll(async () => {
	app = createApp({
		authMiddleware: createTestAuthMiddleware(),
	});
});

describe("API endpoints", () => {
	beforeEach(() => {
		mockFrom.mockClear();
		mockSelect.mockClear();
		mockInsert.mockClear();
		mockEq.mockClear();
		mockIn.mockClear();
		mockContains.mockClear();
		mockOrder.mockClear();
		mockLimit.mockClear();
		mockMaybeSingle.mockReset();
		mockSingle.mockReset();
		mockFromDocuments.mockClear();
		mockFromExistingIndex.mockClear();
		mockSimilaritySearch.mockClear();

		// checkForDrift uses .maybeSingle(); insert uses .single()
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});
		mockSingle.mockResolvedValueOnce({
			data: { id: "test-schema-id", hash: "abc123def456" },
			error: null,
		});
		// deleteSchemaDerivedChunksForDatabase + annotation batch lookup end with .in()
		mockIn.mockResolvedValue({ data: [], error: null });
		mockSimilaritySearch.mockResolvedValue([]);
	});

	test("GET /healthz should return health message", async () => {
		const res = await app.request("/healthz", {
			method: "GET",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("x-response-time")).toMatch(/ms$/);
		expect(res.headers.get("server-timing")).toMatch(/app;dur=/);

		const body = await res.json();
		expect(body).toEqual({
			message: "OK",
			status: "healthy",
			timestamp: expect.any(String),
		});
	});

	test("createAppWithMastra initializes Mastra without breaking healthz", async () => {
		let initCalled = false;
		const appWithMastra = await createAppWithMastra({
			authMiddleware: createTestAuthMiddleware(),
			createMastraServer: () => ({
				init: async () => {
					initCalled = true;
				},
			}),
		});

		expect(initCalled).toBe(true);

		const res = await appWithMastra.request("/healthz", {
			method: "GET",
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("healthy");
	});

	test("POST /ingest should accept valid schema", async () => {
		const validPayload = {
			organization_id: "550e8400-e29b-41d4-a716-446655440000",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders",
					columns: [
						{
							name: "id",
							data_type: "Int64",
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(validPayload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.chunks).toBe(2); // 1 table overview + 1 column
		expect(body.schema_id).toBe("test-schema-id");
		expect(body.schema_hash).toBe("abc123def456");
		expect(body.drift_detected).toBe(false);
		expect(mockFromDocuments).toHaveBeenCalledTimes(1);
	});

	test("POST /ingest should accept valid schema without organization_id (from auth context)", async () => {
		const validPayload = {
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "users",
					description: "User accounts",
					columns: [
						{
							name: "id",
							data_type: "UUID",
							is_primary_key: true,
							description: "Primary key",
						},
					],
				},
			],
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(validPayload),
		});

		// Should succeed because organization_id comes from auth context
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	test("POST /ingest should reject invalid schema - missing required fields", async () => {
		const invalidPayload = {
			organization_id: "550e8400-e29b-41d4-a716-446655440000",
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(invalidPayload),
		});

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.error).toBeDefined();
	});

	test("POST /ingest should reject invalid JSON", async () => {
		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: "invalid json",
		});

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	test("POST /ingest should handle service errors", async () => {
		// Make the embedding storage fail
		mockFromDocuments.mockRejectedValueOnce(new Error("Database error"));

		const validPayload = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders",
					columns: [
						{
							name: "id",
							data_type: "Int64",
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(validPayload),
		});

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.error).toContain("Database error");
	});

	test("POST /ingest should detect schema drift", async () => {
		mockMaybeSingle.mockReset();
		mockSingle.mockReset();

		mockMaybeSingle.mockResolvedValueOnce({
			data: { hash: "completely-different-old-hash-123" },
			error: null,
		});

		mockSingle.mockResolvedValueOnce({
			data: { id: "new-schema-id", hash: "newly-calculated-hash-456" },
			error: null,
		});

		const validPayload = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders with changes",
					columns: [
						{
							name: "id",
							data_type: "Int64",
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(validPayload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.drift_detected).toBe(true);
		expect(body.schema_id).toBe("new-schema-id");
		expect(body.schema_hash).toBe("newly-calculated-hash-456");
	});

	test("POST /ingest should skip when schema unchanged and no force reindex", async () => {
		// Duplicate unique constraint: drift read can be empty; saveSchema resolves via 23505 branch
		mockMaybeSingle.mockReset();
		mockSingle.mockReset();
		mockFromDocuments.mockClear();

		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: "23505" },
		});

		mockSingle.mockResolvedValueOnce({
			data: { id: "existing-id", hash: "same-hash" },
			error: null,
		});

		const validPayload = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders with no changes",
					columns: [
						{
							name: "id",
							data_type: "Int64",
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const res = await app.request("/ingest", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(validPayload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.skipped).toBe(true);
		expect(body.chunks).toBe(0);
		expect(body.drift_detected).toBe(false);
		expect(body.message).toContain("Schema unchanged");
		expect(mockFromDocuments).not.toHaveBeenCalled();
	});

	test("POST /knowledge-base/chunks should store knowledge entries", async () => {
		const payload = {
			organization_id: "550e8400-e29b-41d4-a716-446655440000",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					gold_sql: [
						{
							name: "Total orders by day",
							description: "Counts orders grouped by day",
							sql: "select created_at::date as day, count(*) from orders group by 1",
						},
					],
					glossary: [
						{
							term: "gross_merchandise_value",
							definition: "Total amount of orders before discounts.",
						},
					],
				},
			],
		};

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.chunks.total).toBe(2);
		expect(body.chunks.gold_sql).toBe(1);
		expect(body.chunks.glossary).toBe(1);
		expect(body.chunks.chunks_with_annotations).toBe(0);
		expect(mockFromDocuments).toHaveBeenCalled();
	});

	test("POST /knowledge-base/chunks should reject invalid payload", async () => {
		const payload = {
			organization_id: "550e8400-e29b-41d4-a716-446655440000",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
				},
			],
		};

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": TEST_API_KEY,
			},
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.success).toBe(false);
	});
});
