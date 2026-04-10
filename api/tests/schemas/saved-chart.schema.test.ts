import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
	createChartRequestSchema,
	updateChartRequestSchema,
	chartsListQuerySchema,
	paginatedResponseSchema,
	paginationMetadataSchema,
} from "../../src/schemas/saved-chart.schema";

describe("Saved Chart Schemas", () => {
	const mockVegaSpec = {
		$schema: "https://vega.github.io/schema/vega-lite/v6.json",
		mark: "bar",
		encoding: {
			x: { field: "month", type: "temporal" },
			y: { field: "revenue", type: "quantitative" },
		},
	};

	describe("createChartRequestSchema", () => {
		test("should validate valid chart creation request", () => {
			const validData = {
				title: "Revenue Chart",
				description: "Monthly revenue breakdown",
				sql: "SELECT * FROM revenue",
				sql_params: { year: 2025 },
				vega_lite_spec: mockVegaSpec,
				query_id: "550e8400-e29b-41d4-a716-446655440000",
				database: "analytics",
			};

			const result = createChartRequestSchema.safeParse(validData);
			expect(result.success).toBe(true);
		});

		test("should accept minimal required fields", () => {
			const minimalData = {
				title: "Simple Chart",
				sql: "SELECT 1",
				vega_lite_spec: mockVegaSpec,
			};

			const result = createChartRequestSchema.safeParse(minimalData);
			expect(result.success).toBe(true);
		});

		test("should reject empty title", () => {
			const invalidData = {
				title: "",
				sql: "SELECT 1",
				vega_lite_spec: mockVegaSpec,
			};

			const result = createChartRequestSchema.safeParse(invalidData);
			expect(result.success).toBe(false);
		});

		test("should reject empty SQL", () => {
			const invalidData = {
				title: "Chart",
				sql: "",
				vega_lite_spec: mockVegaSpec,
			};

			const result = createChartRequestSchema.safeParse(invalidData);
			expect(result.success).toBe(false);
		});

		test("should reject invalid query_id UUID", () => {
			const invalidData = {
				title: "Chart",
				sql: "SELECT 1",
				vega_lite_spec: mockVegaSpec,
				query_id: "not-a-uuid",
			};

			const result = createChartRequestSchema.safeParse(invalidData);
			expect(result.success).toBe(false);
		});

		test("should accept array values in encoding (e.g. tooltip)", () => {
			const specWithArrayTooltip = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				mark: "bar",
				encoding: {
					x: { field: "month", type: "temporal" },
					y: { field: "revenue", type: "quantitative" },
					tooltip: [
						{ field: "month", type: "temporal" },
						{ field: "revenue", type: "quantitative" },
					],
				},
			};

			const validData = {
				title: "Tooltip Chart",
				sql: "SELECT * FROM revenue",
				vega_lite_spec: specWithArrayTooltip,
			};

			const result = createChartRequestSchema.safeParse(validData);
			expect(result.success).toBe(true);
		});
	});

	describe("updateChartRequestSchema", () => {
		test("should validate update with all fields", () => {
			const updateData = {
				title: "Updated Title",
				description: "Updated description",
				sql: "SELECT * FROM updated",
				sql_params: { limit: 100 },
				vega_lite_spec: mockVegaSpec,
				database: "new_db",
			};

			const result = updateChartRequestSchema.safeParse(updateData);
			expect(result.success).toBe(true);
		});

		test("should validate update with only one field", () => {
			const updateData = {
				title: "New Title",
			};

			const result = updateChartRequestSchema.safeParse(updateData);
			expect(result.success).toBe(true);
		});

		test("should validate empty update object", () => {
			const updateData = {};

			const result = updateChartRequestSchema.safeParse(updateData);
			expect(result.success).toBe(true);
		});

		test("should reject empty title", () => {
			const updateData = {
				title: "",
			};

			const result = updateChartRequestSchema.safeParse(updateData);
			expect(result.success).toBe(false);
		});
	});

	describe("chartsListQuerySchema", () => {
		test("should apply default values", () => {
			const queryData = {};

			const result = chartsListQuerySchema.parse(queryData);
			expect(result.page).toBe(1);
			expect(result.limit).toBe(10);
			expect(result.sort_by).toBe("created_at");
			expect(result.sort_dir).toBe("desc");
		});

		test("should coerce string numbers to integers", () => {
			const queryData = {
				page: "2" as any,
				limit: "25" as any,
			};

			const result = chartsListQuerySchema.parse(queryData);
			expect(result.page).toBe(2);
			expect(result.limit).toBe(25);
		});

		test("should validate all filter fields", () => {
			const queryData = {
				page: 2,
				limit: 50,
				sort_by: "title",
				sort_dir: "asc",
				title: "Revenue",
				user_id: "user-123",
				created_from: "2025-01-01T00:00:00Z",
				created_to: "2025-12-31T23:59:59Z",
				updated_from: "2025-01-01T00:00:00Z",
				updated_to: "2025-12-31T23:59:59Z",
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.title).toBe("Revenue");
				expect(result.data.user_id).toBe("user-123");
			}
		});

		test("should reject invalid sort_by field", () => {
			const queryData = {
				sort_by: "invalid_field",
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(false);
		});

		test("should reject invalid sort_dir", () => {
			const queryData = {
				sort_dir: "invalid",
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(false);
		});

		test("should reject limit over 100", () => {
			const queryData = {
				limit: 101,
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(false);
		});

		test("should reject page less than 1", () => {
			const queryData = {
				page: 0,
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(false);
		});

		test("should reject invalid datetime format", () => {
			const queryData = {
				created_from: "not-a-datetime",
			};

			const result = chartsListQuerySchema.safeParse(queryData);
			expect(result.success).toBe(false);
		});
	});

	describe("paginationMetadataSchema", () => {
		test("should validate pagination metadata", () => {
			const metadata = {
				page: 1,
				limit: 10,
				total: 100,
				totalPages: 10,
				hasNext: true,
				hasPrev: false,
			};

			const result = paginationMetadataSchema.safeParse(metadata);
			expect(result.success).toBe(true);
		});
	});

	describe("paginatedResponseSchema", () => {
		test("should create paginated response schema for any data type", () => {
			// Define a simple chart schema
			const chartSchema = z.object({
				id: z.string(),
				title: z.string(),
			});

			// Create paginated response schema
			const paginatedChartSchema = paginatedResponseSchema(chartSchema);

			const validResponse = {
				data: [
					{ id: "1", title: "Chart 1" },
					{ id: "2", title: "Chart 2" },
				],
				pagination: {
					page: 1,
					limit: 10,
					total: 2,
					totalPages: 1,
					hasNext: false,
					hasPrev: false,
				},
			};

			const result = paginatedChartSchema.safeParse(validResponse);
			expect(result.success).toBe(true);
		});

		test("should validate empty data array", () => {
			const stringSchema = z.string();
			const paginatedStringSchema = paginatedResponseSchema(stringSchema);

			const emptyResponse = {
				data: [],
				pagination: {
					page: 1,
					limit: 10,
					total: 0,
					totalPages: 0,
					hasNext: false,
					hasPrev: false,
				},
			};

			const result = paginatedStringSchema.safeParse(emptyResponse);
			expect(result.success).toBe(true);
		});

		test("should reject invalid data type", () => {
			const numberSchema = z.number();
			const paginatedNumberSchema = paginatedResponseSchema(numberSchema);

			const invalidResponse = {
				data: ["not", "numbers"],
				pagination: {
					page: 1,
					limit: 10,
					total: 2,
					totalPages: 1,
					hasNext: false,
					hasPrev: false,
				},
			};

			const result = paginatedNumberSchema.safeParse(invalidResponse);
			expect(result.success).toBe(false);
		});
	});
});
