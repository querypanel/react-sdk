import { test, expect, describe, mock, beforeEach } from "bun:test";
import { RunnableLambda } from "@langchain/core/runnables";
import type { EmbeddingService } from "../../src/services/embedding.service";

// Mock Supabase client
const mockSelect = mock(() => mockQuery);
const mockUpsert = mock(() => mockQuery);
const mockDelete = mock(() => mockQuery);
const mockEq = mock(() => mockQuery);
const mockIn = mock(() => mockQuery);
const mockOrder = mock(() => mockQuery);
const mockSingle = mock(() => ({ data: null, error: null }));

const mockQuery = {
	select: mockSelect,
	upsert: mockUpsert,
	delete: mockDelete,
	eq: mockEq,
	in: mockIn,
	order: mockOrder,
	single: mockSingle,
};

const mockFrom = mock(() => mockQuery);

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { KnowledgeBaseService } from "../../src/services/knowledge-base.service";
import type { KnowledgeBaseAnnotation } from "../../src/types/knowledge-base";

describe("KnowledgeBaseService", () => {
	let knowledgeBaseService: KnowledgeBaseService;
	let mockDeleteByTargetIdentifier: ReturnType<typeof mock>;
	let mockStoreDocuments: ReturnType<typeof mock>;
	let mockGetByTargetIdentifier: ReturnType<typeof mock>;

	const mockAnnotation: KnowledgeBaseAnnotation = {
		id: "annotation-id",
		organization_id: "org_123",
		target_identifier: "database:e-commerce:table:orders:column:id",
		content: "This is the primary key for orders",
		created_by: "user_1",
		updated_by: "user_1",
		created_at: "2025-01-01T00:00:00Z",
		updated_at: "2025-01-01T00:00:00Z",
	};

	beforeEach(() => {
		mockDeleteByTargetIdentifier = mock(async () => {});
		mockStoreDocuments = mock(async () => {});
		mockGetByTargetIdentifier = mock(async () => []);

		const mockEmbeddingService = {
			deleteByTargetIdentifier: mockDeleteByTargetIdentifier,
			storeDocuments: mockStoreDocuments,
			getByTargetIdentifier: mockGetByTargetIdentifier,
			storeChain: RunnableLambda.from(async (input: any) => {
				await mockStoreDocuments(input.documents);
				return input;
			}),
		} as unknown as EmbeddingService;

		knowledgeBaseService = new KnowledgeBaseService(mockEmbeddingService);
		mockFrom.mockClear();
		mockSelect.mockClear();
		mockUpsert.mockClear();
		mockDelete.mockClear();
		mockEq.mockClear();
		mockIn.mockClear();
		mockOrder.mockClear();
		mockSingle.mockReset();
		mockSingle.mockImplementation(async () => ({ data: null, error: null }));
	});

	describe("upsert", () => {
		test("should create a new annotation", async () => {
			mockSingle.mockResolvedValueOnce({
				data: mockAnnotation,
				error: null,
			});

			const result = await knowledgeBaseService.upsert({
				organization_id: "org_123",
				target_identifier: "database:e-commerce:table:orders:column:id",
				content: "This is the primary key for orders",
				user_id: "user_1",
			});

			expect(result).toEqual(mockAnnotation);
			expect(mockFrom).toHaveBeenCalledWith("schema_annotations");
			expect(mockUpsert).toHaveBeenCalled();
			expect(mockDeleteByTargetIdentifier).toHaveBeenCalledWith(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);
		});

		test("should delete existing chunks before upserting", async () => {
			mockSingle.mockResolvedValueOnce({
				data: mockAnnotation,
				error: null,
			});

			await knowledgeBaseService.upsert({
				organization_id: "org_123",
				target_identifier: "database:e-commerce:table:orders:column:id",
				content: "Updated content",
				user_id: "user_1",
			});

			expect(mockDeleteByTargetIdentifier).toHaveBeenCalledWith(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);
			expect(mockUpsert).toHaveBeenCalled();
		});

		test("should throw error when upsert fails", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { message: "Database error" },
			});

			await expect(
				knowledgeBaseService.upsert({
					organization_id: "org_123",
					target_identifier: "database:e-commerce:table:orders:column:id",
					content: "Test content",
					user_id: "user_1",
				}),
			).rejects.toThrow(
				"Failed to upsert knowledge base annotation: Database error",
			);
		});
	});

	describe("findByOrganization", () => {
		test("should find all annotations for an organization", async () => {
			const mockAnnotations = [mockAnnotation];

			// Mock the query chain
			const mockQueryChain = {
				select: mock(() => mockQueryChain),
				eq: mock(() => mockQueryChain),
				order: mock(() =>
					Promise.resolve({ data: mockAnnotations, error: null }),
				),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			const result = await knowledgeBaseService.findByOrganization("org_123");

			expect(result).toEqual(mockAnnotations);
			expect(mockQueryChain.select).toHaveBeenCalledWith("*");
			expect(mockQueryChain.eq).toHaveBeenCalledWith(
				"organization_id",
				"org_123",
			);
			expect(mockQueryChain.order).toHaveBeenCalledWith("created_at", {
				ascending: false,
			});
		});

		test("should return empty array when no annotations found", async () => {
			const mockQueryChain = {
				select: mock(() => mockQueryChain),
				eq: mock(() => mockQueryChain),
				order: mock(() => Promise.resolve({ data: [], error: null })),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			const result = await knowledgeBaseService.findByOrganization("org_123");

			expect(result).toEqual([]);
		});

		test("should throw error when query fails", async () => {
			const mockQueryChain = {
				select: mock(() => mockQueryChain),
				eq: mock(() => mockQueryChain),
				order: mock(() =>
					Promise.resolve({ data: null, error: { message: "Query failed" } }),
				),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			await expect(
				knowledgeBaseService.findByOrganization("org_123"),
			).rejects.toThrow(
				"Failed to fetch knowledge base annotations: Query failed",
			);
		});
	});

	describe("findByTargetIdentifier", () => {
		test("should find annotation by target identifier", async () => {
			mockSingle.mockResolvedValueOnce({
				data: mockAnnotation,
				error: null,
			});

			const result = await knowledgeBaseService.findByTargetIdentifier(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);

			expect(result).toEqual(mockAnnotation);
			expect(mockFrom).toHaveBeenCalledWith("schema_annotations");
			expect(mockEq).toHaveBeenCalledWith("organization_id", "org_123");
			expect(mockEq).toHaveBeenCalledWith(
				"target_identifier",
				"database:e-commerce:table:orders:column:id",
			);
		});

		test("should return null when annotation not found", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "PGRST116" },
			});

			const result = await knowledgeBaseService.findByTargetIdentifier(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);

			expect(result).toBeNull();
		});

		test("should throw error when query fails", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "OTHER_ERROR", message: "Database error" },
			});

			await expect(
				knowledgeBaseService.findByTargetIdentifier(
					"org_123",
					"database:e-commerce:table:orders:column:id",
				),
			).rejects.toThrow(
				"Failed to fetch knowledge base annotation: Database error",
			);
		});
	});

	describe("findByTargetIdentifiers", () => {
		test("should find multiple annotations by target identifiers", async () => {
			const mockAnnotations = [
				mockAnnotation,
				{
					...mockAnnotation,
					id: "annotation-id-2",
					target_identifier: "database:e-commerce:table:customers:column:id",
				},
			];

			const mockQueryChain = {
				select: mock(() => mockQueryChain),
				eq: mock(() => mockQueryChain),
				in: mock(() => Promise.resolve({ data: mockAnnotations, error: null })),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			const result = await knowledgeBaseService.findByTargetIdentifiers(
				"org_123",
				[
					"database:e-commerce:table:orders:column:id",
					"database:e-commerce:table:customers:column:id",
				],
			);

			expect(result.size).toBe(2);
			expect(result.get("database:e-commerce:table:orders:column:id")).toEqual(
				mockAnnotation,
			);
		});

		test("should return empty map when no identifiers provided", async () => {
			const result = await knowledgeBaseService.findByTargetIdentifiers(
				"org_123",
				[],
			);

			expect(result.size).toBe(0);
			expect(mockFrom).not.toHaveBeenCalled();
		});

		test("should throw error when query fails", async () => {
			const mockQueryChain = {
				select: mock(() => mockQueryChain),
				eq: mock(() => mockQueryChain),
				in: mock(() =>
					Promise.resolve({ data: null, error: { message: "Query failed" } }),
				),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			await expect(
				knowledgeBaseService.findByTargetIdentifiers("org_123", ["target-1"]),
			).rejects.toThrow(
				"Failed to batch fetch knowledge base annotations: Query failed",
			);
		});
	});

	describe("delete", () => {
		test("should delete annotation and trigger chunk deletion", async () => {
			const mockQueryChain = {
				delete: mock(() => mockQueryChain),
				eq: mock((field: string, value: string) => {
					// On the second call (target_identifier), return the final promise
					if (field === "target_identifier") {
						return Promise.resolve({ data: null, error: null });
					}
					// On the first call (organization_id), return the chain
					return mockQueryChain;
				}),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			await knowledgeBaseService.delete(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);

			expect(mockQueryChain.delete).toHaveBeenCalled();
			expect(mockQueryChain.eq).toHaveBeenCalledWith(
				"organization_id",
				"org_123",
			);
			expect(mockQueryChain.eq).toHaveBeenCalledWith(
				"target_identifier",
				"database:e-commerce:table:orders:column:id",
			);
			expect(mockDeleteByTargetIdentifier).toHaveBeenCalledWith(
				"org_123",
				"database:e-commerce:table:orders:column:id",
			);
		});

		test("should throw error when delete fails", async () => {
			const mockQueryChain = {
				delete: mock(() => mockQueryChain),
				eq: mock((field: string, value: string) => {
					if (field === "target_identifier") {
						return Promise.resolve({
							data: null,
							error: { message: "Delete failed" },
						});
					}
					return mockQueryChain;
				}),
			};

			mockFrom.mockReturnValueOnce(mockQueryChain);

			await expect(
				knowledgeBaseService.delete(
					"org_123",
					"database:e-commerce:table:orders:column:id",
				),
			).rejects.toThrow(
				"Failed to delete knowledge base annotation: Delete failed",
			);
		});
	});

	describe("reEmbedChunk", () => {
		test("should re-embed chunk with annotation", async () => {
			const originalContent = "Column: orders.id\nType: Int64";
			const metadata = {
				organization_id: "org_123",
				type: "column",
				target_identifier: "database:e-commerce:table:orders:column:id",
			};

			await knowledgeBaseService.reEmbedChunk(
				originalContent,
				metadata,
				mockAnnotation,
			);

			expect(mockStoreDocuments).toHaveBeenCalled();
			const calledWith = mockStoreDocuments.mock.calls[0][0];
			expect(calledWith).toHaveLength(1);
			expect(calledWith[0].pageContent).toBe(
				`${originalContent}\n\nBusiness Context:\n${mockAnnotation.content}`,
			);
			// Metadata should include created_at
			expect(calledWith[0].metadata.organization_id).toBe("org_123");
			expect(calledWith[0].metadata.type).toBe("column");
			expect(calledWith[0].metadata.target_identifier).toBe("database:e-commerce:table:orders:column:id");
			expect(calledWith[0].metadata.created_at).toBeDefined();
		});

		test("should re-embed chunk without annotation", async () => {
			const originalContent = "Column: orders.id\nType: Int64";
			const metadata = {
				organization_id: "org_123",
				type: "column",
				target_identifier: "database:e-commerce:table:orders:column:id",
			};

			await knowledgeBaseService.reEmbedChunk(originalContent, metadata);

			expect(mockStoreDocuments).toHaveBeenCalled();
			const calledWith = mockStoreDocuments.mock.calls[0][0];
			expect(calledWith).toHaveLength(1);
			expect(calledWith[0].pageContent).toBe(originalContent);
			// Metadata should include created_at
			expect(calledWith[0].metadata.organization_id).toBe("org_123");
			expect(calledWith[0].metadata.type).toBe("column");
			expect(calledWith[0].metadata.target_identifier).toBe("database:e-commerce:table:orders:column:id");
			expect(calledWith[0].metadata.created_at).toBeDefined();
		});
	});
});
