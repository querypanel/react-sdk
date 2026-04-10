import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SchemaStorageService } from "../../src/services/schema-storage.service";
import { VectorRetrieverService } from "../../src/services/vector-retriever.service";

describe("VectorRetrieverService", () => {
	let service: VectorRetrieverService;
	let mockSchemaStorage: SchemaStorageService;

	beforeEach(() => {
		// Mock SchemaStorageService
		mockSchemaStorage = {
			getLatestSchema: mock(async () => null),
		} as any;
		service = new VectorRetrieverService(mockSchemaStorage);
	});

	describe("retrieve()", () => {
		test("retrieves and combines chunks from all sources", async () => {
			// Mock the search method to return different chunks for each type
			const mockSearch = mock(
				async (
					question: string,
					orgId: string,
					type: string,
					topK: number,
					table?: string,
					database?: string,
					dialect?: string,
				) => {
					if (type === "table_overview") {
						return [
							{
								source: "table_overview",
								pageContent: "users table with id, name, email",
								metadata: {
									table: "users",
									dialect: "postgres",
									type: "table_overview",
								},
								score: 0.95,
							},
						];
					}
					if (type === "column") {
						return [
							{
								source: "column",
								pageContent: "id column - primary key",
								metadata: { table: "users", column: "id", type: "column" },
								score: 0.9,
							},
						];
					}
					if (type === "gold_sql") {
						return [
							{
								source: "gold_sql",
								pageContent: "SELECT * FROM users WHERE active = true",
								metadata: { table: "users", type: "gold_sql" },
								score: 0.85,
							},
						];
					}
					if (type === "glossary") {
						return [
							{
								source: "glossary",
								pageContent: "active users - users with active=true",
								metadata: { type: "glossary" },
								score: 0.8,
							},
						];
					}
					return [];
				},
			);

			(service as any).search = mockSearch;

			const result = await service.retrieve("Show active users", "org_123");

			expect(result.chunks).toHaveLength(4);
			expect(result.chunks[0].source).toBe("table_overview");
			expect(result.chunks[1].source).toBe("column");
			expect(result.chunks[2].source).toBe("gold_sql");
			expect(result.chunks[3].source).toBe("glossary");

			expect(result.primaryTable).toBe("users");
			expect(result.dialect).toBe("postgres");

			// Verify search was called with correct parameters
			// search(question, organizationId, type, topK, table, database, dialect)
			expect(mockSearch).toHaveBeenCalledTimes(4);
			expect(mockSearch).toHaveBeenCalledWith(
				"Show active users",
				"org_123",
				"table_overview",
				1,
				undefined, // table
				undefined, // database
				undefined, // dialect
			);
			expect(mockSearch).toHaveBeenCalledWith(
				"Show active users",
				"org_123",
				"column",
				10,
				undefined, // table
				undefined, // database
				undefined, // dialect
			);
			expect(mockSearch).toHaveBeenCalledWith(
				"Show active users",
				"org_123",
				"gold_sql",
				5,
				undefined, // table
				undefined, // database
				undefined, // dialect
			);
			expect(mockSearch).toHaveBeenCalledWith(
				"Show active users",
				"org_123",
				"glossary",
				3,
				undefined, // table
				undefined, // database
				undefined, // dialect
			);
		});

		test("handles empty results", async () => {
			const mockSearch = mock(async () => []);
			(service as any).search = mockSearch;

			const result = await service.retrieve("test query", "org_123");

			expect(result.chunks).toHaveLength(0);
			expect(result.primaryTable).toBeUndefined();
			expect(result.dialect).toBeUndefined();
		});

		test("extracts primaryTable and dialect from first table chunk", async () => {
			const mockSearch = mock(
				async (question: string, orgId: string, type: string) => {
					if (type === "table_overview") {
						return [
							{
								source: "table_overview",
								pageContent: "orders table",
								metadata: {
									table: "orders",
									dialect: "clickhouse",
									type: "table_overview",
								},
								score: 0.95,
							},
						];
					}
					return [];
				},
			);

			(service as any).search = mockSearch;

			const result = await service.retrieve("Show orders", "org_123");

			expect(result.primaryTable).toBe("orders");
			expect(result.dialect).toBe("clickhouse");
		});
	});

	describe("buildStore()", () => {
		test("builds store with correct filter", async () => {
			const mockBuildStore = mock(async (filter: any) => ({
				similaritySearchWithScore: async () => [],
			}));

			const originalBuildStore = (service as any).buildStore;
			(service as any).buildStore = mockBuildStore;

			await (service as any).search("test", "org_123", "column", 10);

			expect(mockBuildStore).toHaveBeenCalledWith({
				organization_id: "org_123",
				type: "column",
			});

			// Restore
			(service as any).buildStore = originalBuildStore;
		});
	});

	describe("search()", () => {
		test("searches vector store with correct parameters", async () => {
			const mockResults = [
				[
					{
						pageContent: "test content",
						metadata: { table: "users", type: "column" },
					},
					0.9,
				],
			];

			const mockStore = {
				similaritySearchWithScore: mock(async () => mockResults),
			};

			const mockBuildStore = mock(async () => mockStore);
			(service as any).buildStore = mockBuildStore;

			const result = await (service as any).search(
				"test question",
				"org_123",
				"column",
				10,
			);

			expect(mockBuildStore).toHaveBeenCalledWith({
				organization_id: "org_123",
				type: "column",
			});

			expect(mockStore.similaritySearchWithScore).toHaveBeenCalledWith(
				"test question",
				10,
			);

			expect(result).toHaveLength(1);
			expect(result[0].pageContent).toBe("test content");
			expect(result[0].score).toBe(0.9);
		});

		test("converts documents to chunks", async () => {
			const mockResults = [
				[
					{
						pageContent: "column description",
						metadata: { table: "users", column: "email", type: "column" },
					},
					0.85,
				],
				[
					{
						pageContent: "another column",
						metadata: { table: "users", column: "name", type: "column" },
					},
					0.75,
				],
			];

			const mockStore = {
				similaritySearchWithScore: mock(async () => mockResults),
			};

			(service as any).buildStore = mock(async () => mockStore);

			const result = await (service as any).search(
				"test",
				"org_123",
				"column",
				5,
			);

			expect(result).toHaveLength(2);
			expect(result[0].source).toBe("column");
			expect(result[0].metadata.column).toBe("email");
			expect(result[1].metadata.column).toBe("name");
		});
	});

	describe("toChunk()", () => {
		test("converts document to chunk with score", () => {
			const doc = {
				pageContent: "test content",
				metadata: {
					table: "users",
					column: "email",
					type: "column",
				},
			};

			const chunk = (service as any).toChunk(doc, 0.95);

			expect(chunk.source).toBe("column");
			expect(chunk.pageContent).toBe("test content");
			expect(chunk.metadata.table).toBe("users");
			expect(chunk.metadata.column).toBe("email");
			expect(chunk.score).toBe(0.95);
		});

		test("defaults to column source when type is missing", () => {
			const doc = {
				pageContent: "test content",
				metadata: {
					table: "users",
				},
			};

			const chunk = (service as any).toChunk(doc);

			expect(chunk.source).toBe("column");
			expect(chunk.score).toBeUndefined();
		});

		test("handles different source types", () => {
			const types = ["table_overview", "column", "gold_sql", "glossary"];

			types.forEach((type) => {
				const doc = {
					pageContent: "content",
					metadata: { type },
				};

				const chunk = (service as any).toChunk(doc, 0.8);
				expect(chunk.source).toBe(type);
			});
		});
	});

	describe("retrievalChain", () => {
		test("invokes retrieve and returns result with input", async () => {
			const mockRetrieve = mock(async () => ({
				chunks: [
					{
						source: "table_overview",
						pageContent: "users table",
						metadata: { table: "users", dialect: "postgres" },
					},
				],
				primaryTable: "users",
				dialect: "postgres",
			}));

			(service as any).retrieve = mockRetrieve;

			const input = {
				question: "Show users",
				organizationId: "org_123",
				someOtherField: "value",
			};

			const result = await service.retrievalChain.invoke(input);

			expect(mockRetrieve).toHaveBeenCalledWith(
				"Show users",
				"org_123",
				undefined,
				undefined,
			);
			expect(result.question).toBe("Show users");
			expect(result.organizationId).toBe("org_123");
			expect(result.someOtherField).toBe("value");
			expect(result.retrieval).toBeDefined();
			expect(result.retrieval.primaryTable).toBe("users");
			expect(result.retrieval.dialect).toBe("postgres");
			expect(result.retrieval.chunks).toHaveLength(1);
		});

		test("preserves all input fields in output", async () => {
			const mockRetrieve = mock(async () => ({
				chunks: [],
				primaryTable: undefined,
				dialect: undefined,
			}));

			(service as any).retrieve = mockRetrieve;

			const input = {
				question: "test",
				organizationId: "org",
				field1: "value1",
				field2: 123,
				field3: { nested: "object" },
			};

			const result = await service.retrievalChain.invoke(input);

			expect(result.field1).toBe("value1");
			expect(result.field2).toBe(123);
			expect(result.field3).toEqual({ nested: "object" });
			expect(result.retrieval).toBeDefined();
		});
	});
});
