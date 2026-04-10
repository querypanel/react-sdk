import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Document } from "@langchain/core/documents";

// Create trackable mock functions
const mockFromDocuments = mock(async () => {});
const mockSimilaritySearch = mock(async () => []);
const mockDelete = mock(async () => {});
const mockFromExistingIndex = mock(async () => ({
	similaritySearch: mockSimilaritySearch,
	delete: mockDelete,
}));

// Mock OpenAI
mock.module("@langchain/openai", () => ({
	OpenAIEmbeddings: class {
		constructor() {}
	},
}));

// Mock SupabaseVectorStore
mock.module("@langchain/community/vectorstores/supabase", () => ({
	SupabaseVectorStore: {
		fromDocuments: mockFromDocuments,
		fromExistingIndex: mockFromExistingIndex,
	},
}));

// Mock Supabase client
const mockContains = mock();
const mockSelect = mock(() => ({
	contains: mockContains,
}));
const mockFrom = mock(() => ({
	select: mockSelect,
}));

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

// Mock config
mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: {
			url: "https://test.supabase.co",
			serviceRoleKey: "test-key",
		},
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

import { EmbeddingService } from "../../src/services/embedding.service";

describe("EmbeddingService", () => {
	let embeddingService: EmbeddingService;

	beforeEach(() => {
		embeddingService = new EmbeddingService();
		mockFromDocuments.mockClear();
		mockFromExistingIndex.mockClear();
		mockSimilaritySearch.mockClear();
		mockDelete.mockClear();
		mockFrom.mockClear();
		mockSelect.mockClear();
		mockContains.mockClear();
	});

	test("should store documents", async () => {
		const documents = [
			new Document({
				pageContent: "Test content",
				metadata: { organization_id: "org_123" },
			}),
		];

		await embeddingService.storeDocuments(documents);

		expect(mockFromDocuments).toHaveBeenCalledTimes(1);
		expect(mockFromDocuments).toHaveBeenCalledWith(
			documents,
			expect.anything(),
			expect.objectContaining({
				tableName: "schema_chunks",
				queryName: "match_documents",
			}),
		);
	});

	test("should search documents with organization filter", async () => {
		const query = "test query";
		const organizationId = "org_123";

		const results = await embeddingService.search(query, organizationId);

		expect(mockFromExistingIndex).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				filter: { organization_id: organizationId },
				tableName: "schema_chunks",
				queryName: "match_documents",
			}),
		);
		expect(mockSimilaritySearch).toHaveBeenCalledWith(query, 5);
		expect(results).toEqual([]);
	});

	test("should search with default limit of 5", async () => {
		await embeddingService.search("test query", "org_123");

		expect(mockSimilaritySearch).toHaveBeenCalledWith("test query", 5);
	});

	test("should search with custom limit", async () => {
		await embeddingService.search("test query", "org_123", 10);

		expect(mockSimilaritySearch).toHaveBeenCalledWith("test query", 10);
	});

	test("should delete chunks by target identifier", async () => {
		mockContains.mockResolvedValueOnce({
			data: [{ id: 1 }, { id: 2 }],
			error: null,
		});

		await embeddingService.deleteByTargetIdentifier(
			"org_123",
			"database:test:table:users:column:id",
		);

		expect(mockFrom).toHaveBeenCalledWith("schema_chunks");
		expect(mockContains).toHaveBeenCalledWith("metadata", {
			organization_id: "org_123",
			target_identifier: "database:test:table:users:column:id",
		});
		expect(mockFromExistingIndex).toHaveBeenCalled();
		expect(mockDelete).toHaveBeenCalledWith({ ids: [1, 2] });
	});

	test("should handle deleting non-existent chunks gracefully", async () => {
		mockContains.mockResolvedValueOnce({
			data: [],
			error: null,
		});

		await embeddingService.deleteByTargetIdentifier(
			"org_123",
			"database:test:table:users:column:id",
		);

		expect(mockDelete).not.toHaveBeenCalled();
	});

	test("should throw error when supabase query fails", async () => {
		mockContains.mockResolvedValueOnce({
			data: null,
			error: { message: "Database connection failed" },
		});

		await expect(
			embeddingService.deleteByTargetIdentifier(
				"org_123",
				"database:test:table:users:column:id",
			),
		).rejects.toThrow("Failed to find chunks: Database connection failed");
	});
});
