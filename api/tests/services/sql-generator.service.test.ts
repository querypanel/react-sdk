import { describe, expect, test, mock, beforeEach } from "bun:test";
import { SqlGeneratorService } from "../../src/services/sql-generator.service";
import type { ContextChunk } from "../../src/types/query";

describe("SqlGeneratorService", () => {
	let service: SqlGeneratorService;

	beforeEach(() => {
		service = new SqlGeneratorService();
	});

	describe("formatContext()", () => {
		test("formats context with table and column metadata", () => {
			const chunks: ContextChunk[] = [
				{
					source: "schema",
					pageContent: "users table structure",
					metadata: { table: "users", column: "id" },
				},
			];

			const result = (service as any).formatContext(chunks);

			expect(result).toContain("Source: schema");
			expect(result).toContain("Table: users");
			expect(result).toContain("Column: id");
			expect(result).toContain("users table structure");
		});

		test("formats context without metadata", () => {
			const chunks: ContextChunk[] = [
				{
					source: "general",
					pageContent: "some content",
					metadata: {},
				},
			];

			const result = (service as any).formatContext(chunks);

			expect(result).toContain("Source: general");
			expect(result).toContain("some content");
			expect(result).not.toContain("Table:");
			expect(result).not.toContain("Column:");
		});

		test("formats context with only table metadata", () => {
			const chunks: ContextChunk[] = [
				{
					source: "table_info",
					pageContent: "table description",
					metadata: { table: "orders" },
				},
			];

			const result = (service as any).formatContext(chunks);

			expect(result).toContain("Source: table_info");
			expect(result).toContain("Table: orders");
			expect(result).not.toContain("Column:");
		});

		test("separates multiple chunks with separator", () => {
			const chunks: ContextChunk[] = [
				{
					source: "chunk1",
					pageContent: "content 1",
					metadata: {},
				},
				{
					source: "chunk2",
					pageContent: "content 2",
					metadata: {},
				},
			];

			const result = (service as any).formatContext(chunks);

			expect(result).toContain("---");
			expect(result).toContain("content 1");
			expect(result).toContain("content 2");
		});

		test("handles empty chunks array", () => {
			const result = (service as any).formatContext([]);

			expect(result).toBe("");
		});
	});

	describe("dialectInstructions()", () => {
		test("returns postgres instructions", () => {
			const result = (service as any).dialectInstructions("postgres");

			expect(result).toContain("PostgreSQL");
			expect(result).toContain("$1, $2");
		});

		test("returns clickhouse instructions with single braces (not double)", () => {
			const result = (service as any).dialectInstructions("clickhouse");

			expect(result).toContain("ClickHouse");
			expect(result).toContain("{name:Type}");
			// CRITICAL: Must use single braces, not double braces
			// Double braces in substituted values are NOT escaped by LangChain
			expect(result).not.toContain("{{name:Type}}");
			expect(result).not.toContain("{{status:String}}");
			expect(result).not.toContain("{{customer_id:Int32}}");
		});

		test("returns bigquery instructions with named parameters", () => {
			const result = (service as any).dialectInstructions("bigquery");

			expect(result).toContain("BigQuery");
			expect(result).toContain("@start_date");
			expect(result).toContain("@tenant_id");
			expect(result).toContain("NEVER use $1, $2");
		});

		test("returns mysql instructions", () => {
			const result = (service as any).dialectInstructions("mysql");

			expect(result).toContain("MySQL");
			expect(result).toContain("?");
		});

		test("returns ANSI SQL for unknown dialect", () => {
			const result = (service as any).dialectInstructions("unknown_dialect");

			expect(result).toContain("ANSI SQL");
			expect(result).toContain("$1, $2");
		});

		test("returns ANSI SQL when dialect is undefined", () => {
			const result = (service as any).dialectInstructions(undefined);

			expect(result).toContain("ANSI SQL");
		});

		test("handles case insensitive dialect names", () => {
			const result = (service as any).dialectInstructions("PostgreS");

			expect(result).toContain("PostgreSQL");
		});
	});

	describe("generate() and repair() - error handling", () => {
		test("generate throws error when response is not valid JSON", async () => {
			const mockChain = {
				invoke: mock(() => Promise.resolve("Not valid JSON")),
			};
			(service as any).chain = mockChain;

			await expect(
				service.generate({
					question: "Get users",
					contextChunks: [],
				}),
			).rejects.toThrow("Failed to parse SQL generation response");
		});

		test("generate throws error when response does not include SQL", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							params: [],
							rationale: "Something",
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			await expect(
				service.generate({
					question: "Get users",
					contextChunks: [],
				}),
			).rejects.toThrow("Model response did not include SQL");
		});

		test("generate handles response without params", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "SELECT * FROM users",
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			const result = await service.generate({
				question: "Get users",
				contextChunks: [],
			});

			expect(result.params).toEqual([]);
			expect(result.sql).toBe("SELECT * FROM users");
		});

		test("generate handles response without rationale", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "SELECT * FROM users",
							params: [],
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			const result = await service.generate({
				question: "Get users",
				contextChunks: [],
			});

			expect(result.rationale).toBeUndefined();
		});

		test("generate trims whitespace from SQL", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "  SELECT * FROM users  \n",
							params: [],
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			const result = await service.generate({
				question: "Get users",
				contextChunks: [],
			});

			expect(result.sql).toBe("SELECT * FROM users");
		});

		test("generate defaults dialect to ansi", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "SELECT * FROM users",
							params: [],
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			const result = await service.generate({
				question: "Get users",
				contextChunks: [],
			});

			expect(result.dialect).toBe("ansi");
		});

		test("generate uses provided dialect", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "SELECT * FROM users",
							params: [],
						}),
					),
				),
			};
			(service as any).chain = mockChain;

			const result = await service.generate({
				question: "Get users",
				contextChunks: [],
				dialect: "postgres",
			});

			expect(result.dialect).toBe("postgres");
		});

		test("repair throws error when response is not valid JSON", async () => {
			const mockChain = {
				invoke: mock(() => Promise.resolve("Not valid JSON")),
			};
			(service as any).repairChain = mockChain;

			await expect(
				service.repair({
					question: "Get users",
					contextChunks: [],
					previousSql: "SELECT * FROM users",
					error: "some error",
				}),
			).rejects.toThrow("Failed to parse SQL repair response");
		});

		test("repair throws error when response does not include SQL", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							rationale: "Fixed something",
						}),
					),
				),
			};
			(service as any).repairChain = mockChain;

			await expect(
				service.repair({
					question: "Get users",
					contextChunks: [],
					previousSql: "SELECT * FROM users",
					error: "some error",
				}),
			).rejects.toThrow("Model response did not include SQL");
		});

		test("repair defaults dialect to ansi", async () => {
			const mockChain = {
				invoke: mock(() =>
					Promise.resolve(
						JSON.stringify({
							sql: "SELECT * FROM users",
						}),
					),
				),
			};
			(service as any).repairChain = mockChain;

			const result = await service.repair({
				question: "Get users",
				contextChunks: [],
				previousSql: "SELECT * FROM user",
				error: "table not found",
			});

			expect(result.dialect).toBe("ansi");
			expect(result.params).toEqual([]);
		});

		test("generate passes correct parameters to chain", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve(
					JSON.stringify({
						sql: "SELECT * FROM users",
						params: [],
					}),
				),
			);
			const mockChain = { invoke: mockInvoke };
			(service as any).chain = mockChain;

			await service.generate({
				question: "Get all users",
				contextChunks: [
					{
						source: "table",
						pageContent: "users table",
						metadata: { table: "users" },
					},
				],
				dialect: "postgres",
				primaryTable: "users",
			});

			expect(mockInvoke).toHaveBeenCalled();
			const args = mockInvoke.mock.calls[0][0];
			expect(args.question).toBe("Get all users");
			expect(args.primary_table).toBe("users");
			expect(args.context).toContain("users table");
		});

		test("repair passes correct parameters to chain", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve(
					JSON.stringify({
						sql: "SELECT * FROM users",
						params: [],
					}),
				),
			);
			const mockChain = { invoke: mockInvoke };
			(service as any).repairChain = mockChain;

			await service.repair({
				question: "Get users",
				contextChunks: [],
				previousSql: "SELECT * FROM user",
				error: "table not found",
				dialect: "postgres",
				primaryTable: "users",
			});

			expect(mockInvoke).toHaveBeenCalled();
			const args = mockInvoke.mock.calls[0][0];
			expect(args.question).toBe("Get users");
			expect(args.previous_sql).toBe("SELECT * FROM user");
			expect(args.error).toBe("table not found");
		});
	});
});
