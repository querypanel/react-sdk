import { test, expect, describe } from "bun:test";
import { ChunkerService } from "../../src/services/chunker.service";
import type { Schema } from "../../src/types/schema";

describe("ChunkerService", () => {
	const chunkerService = new ChunkerService();

	const mockSchema: Schema = {
		database: "e-commerce",
		dialect: "Clickhouse",
		tables: [
			{
				table_name: "orders",
				description: "Table containing customer orders",
				columns: [
					{
						name: "id",
						data_type: "Int64",
						is_primary_key: true,
						description: "Unique order identifier",
					},
					{
						name: "amount",
						data_type: "Decimal(10,2)",
						is_primary_key: false,
						description: "Order amount",
					},
				],
			},
			{
				table_name: "customers",
				description: "Customer information",
				columns: [
					{
						name: "customer_id",
						data_type: "Int64",
						is_primary_key: true,
						description: "Customer ID",
					},
				],
			},
		],
	};

	test("should chunk schema into documents", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");

		// Should create 1 table overview + 2 columns for orders, 1 table overview + 1 column for customers
		expect(documents).toHaveLength(5);
	});

	test("should create table overview chunk with correct format", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");
		const tableOverview = documents[0];

		expect(tableOverview.pageContent).toContain("Database: e-commerce");
		expect(tableOverview.pageContent).toContain("Dialect: Clickhouse");
		expect(tableOverview.pageContent).toContain("Table: orders");
		expect(tableOverview.pageContent).toContain(
			"Description: Table containing customer orders",
		);
		expect(tableOverview.pageContent).toContain("Primary keys: id");
	});

	test("should create column chunk with correct format", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");
		const columnChunk = documents[1];

		expect(columnChunk.pageContent).toContain("Column: orders.id");
		expect(columnChunk.pageContent).toContain("Type: Int64");
		expect(columnChunk.pageContent).toContain("Table: orders");
	});

	test("should include organization_id in all metadata", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");

		documents.forEach((doc) => {
			expect(doc.metadata.organization_id).toBe("org_123");
		});
	});

	test("should include correct metadata in table overview", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");
		const tableOverview = documents[0];

		expect(tableOverview.metadata.organization_id).toBe("org_123");
		expect(tableOverview.metadata.type).toBe("table_overview");
		expect(tableOverview.metadata.database).toBe("e-commerce");
		expect(tableOverview.metadata.dialect).toBe("Clickhouse");
		expect(tableOverview.metadata.table).toBe("orders");
		expect(tableOverview.metadata.target_identifier).toBe("database:e-commerce:table:orders");
		expect(tableOverview.metadata.created_at).toBeDefined();
	});

	test("should include correct metadata in column chunk", () => {
		const documents = chunkerService.chunkSchema(mockSchema, "org_123");
		const columnChunk = documents[1];

		expect(columnChunk.metadata.organization_id).toBe("org_123");
		expect(columnChunk.metadata.type).toBe("column");
		expect(columnChunk.metadata.database).toBe("e-commerce");
		expect(columnChunk.metadata.dialect).toBe("Clickhouse");
		expect(columnChunk.metadata.table).toBe("orders");
		expect(columnChunk.metadata.column).toBe("id");
		expect(columnChunk.metadata.data_type).toBe("Int64");
		expect(columnChunk.metadata.is_primary_key).toBe(true);
		expect(columnChunk.metadata.target_identifier).toBe("database:e-commerce:table:orders:column:id");
		expect(columnChunk.metadata.created_at).toBeDefined();
	});

	test("should handle tables with multiple primary keys", () => {
		const schema: Schema = {
			database: "test",
			dialect: "PostgreSQL",
			tables: [
				{
					table_name: "composite",
					description: "Table with composite key",
					columns: [
						{
							name: "id1",
							data_type: "Int",
							is_primary_key: true,
							description: "First key",
						},
						{
							name: "id2",
							data_type: "Int",
							is_primary_key: true,
							description: "Second key",
						},
					],
				},
			],
		};

		const documents = chunkerService.chunkSchema(schema, "org_123");
		const tableOverview = documents[0];

		expect(tableOverview.pageContent).toContain("Primary keys: id1, id2");
	});

	test("should handle tables with no primary keys", () => {
		const schema: Schema = {
			database: "test",
			dialect: "PostgreSQL",
			tables: [
				{
					table_name: "no_pk",
					description: "Table without primary key",
					columns: [
						{
							name: "col1",
							data_type: "Text",
							is_primary_key: false,
							description: "Some column",
						},
					],
				},
			],
		};

		const documents = chunkerService.chunkSchema(schema, "org_123");
		const tableOverview = documents[0];

		expect(tableOverview.pageContent).toContain("Primary keys: ");
	});
});
