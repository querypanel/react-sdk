import { test, expect, describe } from "bun:test";
import { ingestRequestSchema } from "../../src/schemas/ingest.schema";

describe("Ingest request schema validation", () => {
	test("should validate correct request", () => {
		const validRequest = {
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
						{
							name: "amount",
							data_type: "Decimal(10,2)",
							is_primary_key: false,
							description: "Order amount",
						},
					],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(validRequest);
		expect(result.success).toBe(true);
	});

	test("should accept request without organization_id (comes from auth context)", () => {
		const validRequest = {
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [],
		};

		const result = ingestRequestSchema.safeParse(validRequest);
		expect(result.success).toBe(true);
	});

	test("should reject request without database", () => {
		const invalidRequest = {
			organization_id: "org_123",
			dialect: "Clickhouse",
			tables: [],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject request without dialect", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			tables: [],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject request without tables", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should validate request with empty tables array", () => {
		const validRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [],
		};

		const result = ingestRequestSchema.safeParse(validRequest);
		expect(result.success).toBe(true);
	});

	test("should reject table without table_name", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					description: "Customer orders",
					columns: [],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject table without description", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					columns: [],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject table without columns", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders",
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject column without name", () => {
		const invalidRequest = {
			organization_id: "org_123",
			database: "e-commerce",
			dialect: "Clickhouse",
			tables: [
				{
					table_name: "orders",
					description: "Customer orders",
					columns: [
						{
							data_type: "Int64",
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject column without data_type", () => {
		const invalidRequest = {
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
							is_primary_key: true,
							description: "Order ID",
						},
					],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject column without is_primary_key", () => {
		const invalidRequest = {
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
							description: "Order ID",
						},
					],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should reject column with invalid is_primary_key type", () => {
		const invalidRequest = {
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
							is_primary_key: "true",
							description: "Order ID",
						},
					],
				},
			],
		};

		const result = ingestRequestSchema.safeParse(invalidRequest);
		expect(result.success).toBe(false);
	});

	test("should validate request with multiple tables", () => {
		const validRequest = {
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

		const result = ingestRequestSchema.safeParse(validRequest);
		expect(result.success).toBe(true);
	});
});
