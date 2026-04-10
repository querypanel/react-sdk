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
import { registerKnowledgeBaseRoutes } from "../../src/routes/knowledge-base.route";
import type { AppContext } from "../../src/types/app";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (deps: {
	knowledgeBaseService?: any;
	embeddingService?: any;
	knowledgeChunkService?: any;
}) => {
	const app = new Hono<AppContext>();
	// Use test auth middleware to set auth context
	app.use("*", createTestAuthMiddleware());
	registerKnowledgeBaseRoutes(app, {
		knowledgeBaseService: deps.knowledgeBaseService || {},
		embeddingService: deps.embeddingService || {},
		knowledgeChunkService: deps.knowledgeChunkService || {},
	});
	return app;
};

describe("POST /knowledge-base/annotations", () => {
	test("creates annotation successfully", async () => {
		const mockUpsert = mock(async (data: any) => ({
			id: "550e8400-e29b-41d4-a716-446655440000",
			organization_id: data.organization_id,
			target_identifier: data.target_identifier,
			content: data.content,
			created_by: data.user_id,
			updated_by: data.user_id,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}));

		const app = createApp({
			knowledgeBaseService: { upsert: mockUpsert },
		});

		const res = await app.request("/knowledge-base/annotations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				target_identifier: "users.email",
				content: "User email address",
				user_id: "user_123",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.message).toContain("successfully");
		expect(body.annotation).toBeDefined();
		expect(body.annotation.target_identifier).toBe("users.email");
		expect(mockUpsert).toHaveBeenCalled();
	});

	test("returns 500 for validation errors", async () => {
		const app = createApp({
			knowledgeBaseService: { upsert: mock(async () => ({})) },
		});

		const res = await app.request("/knowledge-base/annotations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				// Missing required fields - invalid UUID
				organization_id: "not-a-uuid",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBeDefined();
	});

	test("returns 500 for service errors", async () => {
		const mockUpsert = mock(async () => {
			throw new Error("Database connection failed");
		});

		const app = createApp({
			knowledgeBaseService: { upsert: mockUpsert },
		});

		const res = await app.request("/knowledge-base/annotations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				target_identifier: "users.email",
				content: "Email address",
				user_id: "user_123",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Database connection failed");
	});
});

describe("GET /knowledge-base/annotations", () => {
	test("returns annotations for organization", async () => {
		const mockFind = mock(async (orgId: string) => [
			{ id: 1, organization_id: orgId, target_identifier: "users.email" },
			{ id: 2, organization_id: orgId, target_identifier: "orders.total" },
		]);

		const app = createApp({
			knowledgeBaseService: { findByOrganization: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations?organization_id=org_123",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.annotations).toHaveLength(2);
		expect(body.count).toBe(2);
		// In development mode, uses default organization_id
		expect(mockFind).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
		);
	});

	test("returns empty array when no annotations found", async () => {
		const mockFind = mock(async () => []);

		const app = createApp({
			knowledgeBaseService: { findByOrganization: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations?organization_id=org_123",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.annotations).toHaveLength(0);
		expect(body.count).toBe(0);
	});

	test("uses default organization_id from dev mode when not provided", async () => {
		const mockFind = mock(async (orgId: string) => []);

		const app = createApp({
			knowledgeBaseService: { findByOrganization: mockFind },
		});

		const res = await app.request("/knowledge-base/annotations");

		// In development mode, auth middleware provides default org_id
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		// Should use default dev organization_id
		expect(mockFind).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
		);
	});

	test("returns 500 for service errors", async () => {
		const mockFind = mock(async () => {
			throw new Error("Query failed");
		});

		const app = createApp({
			knowledgeBaseService: { findByOrganization: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations?organization_id=org_123",
		);

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Query failed");
	});
});

describe("GET /knowledge-base/annotations/:target_identifier", () => {
	test("returns specific annotation", async () => {
		const mockFind = mock(async (orgId: string, targetId: string) => ({
			id: 1,
			organization_id: orgId,
			target_identifier: targetId,
			content: "Test annotation",
		}));

		const app = createApp({
			knowledgeBaseService: { findByTargetIdentifier: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations/users.email?organization_id=org_123",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.annotation).toBeDefined();
		expect(body.annotation.target_identifier).toBe("users.email");
		// In development mode, uses default organization_id
		expect(mockFind).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"users.email",
		);
	});

	test("returns 404 when annotation not found", async () => {
		const mockFind = mock(async () => null);

		const app = createApp({
			knowledgeBaseService: { findByTargetIdentifier: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations/nonexistent?organization_id=org_123",
		);

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toContain("not found");
	});

	test("uses default organization_id from dev mode when not provided", async () => {
		const mockFind = mock(async (orgId: string, targetId: string) => null);

		const app = createApp({
			knowledgeBaseService: { findByTargetIdentifier: mockFind },
		});

		const res = await app.request("/knowledge-base/annotations/users.email");

		// In development mode, auth middleware provides default org_id
		expect(res.status).toBe(404); // Not found because mockFind returns null
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		// Should use default dev organization_id
		expect(mockFind).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"users.email",
		);
	});

	test("returns 500 for service errors", async () => {
		const mockFind = mock(async () => {
			throw new Error("Database error");
		});

		const app = createApp({
			knowledgeBaseService: { findByTargetIdentifier: mockFind },
		});

		const res = await app.request(
			"/knowledge-base/annotations/users.email?organization_id=org_123",
		);

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Database error");
	});
});

describe("DELETE /knowledge-base/annotations/:target_identifier", () => {
	test("deletes annotation successfully", async () => {
		const mockDelete = mock(async () => {});

		const app = createApp({
			knowledgeBaseService: { delete: mockDelete },
		});

		const res = await app.request(
			"/knowledge-base/annotations/users.email?organization_id=org_123",
			{ method: "DELETE" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.message).toContain("deleted successfully");
		// In development mode, uses default organization_id
		expect(mockDelete).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"users.email",
		);
	});

	test("uses default organization_id from dev mode when not provided", async () => {
		const mockDelete = mock(async (orgId: string, targetId: string) => {});

		const app = createApp({
			knowledgeBaseService: { delete: mockDelete },
		});

		const res = await app.request("/knowledge-base/annotations/users.email", {
			method: "DELETE",
		});

		// In development mode, auth middleware provides default org_id
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		// Should use default dev organization_id
		expect(mockDelete).toHaveBeenCalledWith(
			"23011c66-b1dd-40f3-bc88-4065c6357d39",
			"users.email",
		);
	});

	test("returns 500 for service errors", async () => {
		const mockDelete = mock(async () => {
			throw new Error("Delete failed");
		});

		const app = createApp({
			knowledgeBaseService: { delete: mockDelete },
		});

		const res = await app.request(
			"/knowledge-base/annotations/users.email?organization_id=org_123",
			{ method: "DELETE" },
		);

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Delete failed");
	});
});

describe("POST /knowledge-base/chunks", () => {
	test("stores chunks successfully", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [
				{
					pageContent: "users table",
					metadata: {
						type: "table_overview",
						table: "users",
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
				{
					pageContent: "SELECT * FROM users",
					metadata: {
						type: "gold_sql",
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
			],
			counts: { gold_sql: 1, glossary: 0 },
		}));

		const mockFindByTargetIdentifiers = mock(async () => new Map());
		const mockStoreChainInvoke = mock(async (input: any) => input);

		const app = createApp({
			knowledgeBaseService: {
				findByTargetIdentifiers: mockFindByTargetIdentifiers,
			},
			embeddingService: {
				storeChain: {
					invoke: mockStoreChainInvoke,
				},
			},
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "users",
						gold_sql: [
							{ sql: "SELECT * FROM users", description: "Get all users" },
						],
					},
				],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.message).toContain("Stored 2");
		expect(body.chunks.total).toBe(2);
		expect(body.chunks.gold_sql).toBe(1);
		expect(mockBuildDocuments).toHaveBeenCalled();
		expect(mockStoreChainInvoke).toHaveBeenCalled();
	});

	test("merges annotations with chunks", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [
				{
					pageContent: "users table",
					metadata: {
						type: "table_overview",
						table: "users",
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
			],
			counts: { gold_sql: 0, glossary: 1 },
		}));

		const mockFindByTargetIdentifiers = mock(async () => {
			const map = new Map();
			map.set("users", {
				target_identifier: "users",
				content: "Main user table with authentication data",
			});
			return map;
		});

		const mockStoreChainInvoke = mock(async (input: any) => {
			// Verify the annotation was merged
			expect(input.documents[0].pageContent).toContain("Business Context:");
			expect(input.documents[0].pageContent).toContain("authentication data");
			return input;
		});

		const app = createApp({
			knowledgeBaseService: {
				findByTargetIdentifiers: mockFindByTargetIdentifiers,
			},
			embeddingService: {
				storeChain: {
					invoke: mockStoreChainInvoke,
				},
			},
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "users",
						glossary: [{ term: "user", definition: "person with an account" }],
					},
				],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.chunks.chunks_with_annotations).toBe(1);
		expect(mockStoreChainInvoke).toHaveBeenCalled();
	});

	test("returns 400 when no documents to store", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [],
			counts: { gold_sql: 0, glossary: 0 },
		}));

		const app = createApp({
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "empty",
						gold_sql: [{ sql: "SELECT 1" }],
					},
				],
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toContain("No knowledge base chunks");
	});

	test("returns 500 for validation errors", async () => {
		const app = createApp({
			knowledgeChunkService: { buildDocuments: mock(() => ({})) },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				// Invalid data - not a UUID
				organization_id: "not-a-uuid",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBeDefined();
	});

	test("returns 500 for embedding service errors", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [
				{
					pageContent: "test",
					metadata: {
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
			],
			counts: { gold_sql: 1, glossary: 0 },
		}));

		const mockStoreChainInvoke = mock(async () => {
			throw new Error("Embedding storage failed");
		});

		const app = createApp({
			knowledgeBaseService: {
				findByTargetIdentifiers: mock(async () => new Map()),
			},
			embeddingService: {
				storeChain: {
					invoke: mockStoreChainInvoke,
				},
			},
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "users",
						gold_sql: [{ sql: "SELECT * FROM users" }],
					},
				],
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Embedding storage failed");
	});

	test("handles documents without annotations", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [
				{
					pageContent: "users table",
					metadata: {
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
				{
					pageContent: "orders table",
					metadata: {
						target_identifier: "orders",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
			],
			counts: { gold_sql: 2, glossary: 0 },
		}));

		const mockFindByTargetIdentifiers = mock(async () => new Map());
		const mockStoreChainInvoke = mock(async (input: any) => input);

		const app = createApp({
			knowledgeBaseService: {
				findByTargetIdentifiers: mockFindByTargetIdentifiers,
			},
			embeddingService: {
				storeChain: {
					invoke: mockStoreChainInvoke,
				},
			},
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		const res = await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "users",
						gold_sql: [{ sql: "SELECT * FROM users" }],
					},
				],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.chunks.chunks_with_annotations).toBe(0);
	});

	test("filters target identifiers correctly", async () => {
		const mockBuildDocuments = mock(() => ({
			documents: [
				{
					pageContent: "test1",
					metadata: {
						target_identifier: "users",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
				{
					pageContent: "test2",
					metadata: {
						target_identifier: "orders",
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
				{
					pageContent: "test3",
					metadata: {
						// No target_identifier
						organization_id: "550e8400-e29b-41d4-a716-446655440000",
					},
				},
			],
			counts: { gold_sql: 3, glossary: 0 },
		}));

		const mockFindByTargetIdentifiers = mock(
			async (orgId: string, ids: string[]) => {
				// Should only receive 2 IDs (filtering out the one without target_identifier)
				expect(ids).toHaveLength(2);
				expect(ids).toContain("users");
				expect(ids).toContain("orders");
				return new Map();
			},
		);

		const mockStoreDocuments = mock(async () => {});

		const app = createApp({
			knowledgeBaseService: {
				findByTargetIdentifiers: mockFindByTargetIdentifiers,
			},
			embeddingService: { storeDocuments: mockStoreDocuments },
			knowledgeChunkService: { buildDocuments: mockBuildDocuments },
		});

		await app.request("/knowledge-base/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organization_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
				dialect: "postgres",
				tables: [
					{
						table_name: "users",
						gold_sql: [{ sql: "SELECT 1" }],
					},
				],
			}),
		});

		expect(mockFindByTargetIdentifiers).toHaveBeenCalled();
	});
});
