import { test, expect, describe, mock, beforeEach } from "bun:test";

// Mock Supabase client
const mockSingle = mock(() => ({ data: null, error: null }));

const mockQuery = {
	select: mock(function () {
		return this;
	}),
	insert: mock(function () {
		return this;
	}),
	update: mock(function () {
		return this;
	}),
	delete: mock(function () {
		return this;
	}),
	eq: mock(function () {
		return this;
	}),
	single: mockSingle,
};

const mockFrom = mock(() => mockQuery);

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { SavedChartService } from "../../src/services/saved-chart.service";
import type { AuthContext } from "../../src/types/auth";

describe("SavedChartService", () => {
	let service: SavedChartService;
	let mockAuth: AuthContext;

	const mockVegaLiteSpec = {
		$schema: "https://vega.github.io/schema/vega-lite/v6.json",
		mark: "bar",
		encoding: {},
	};

	const mockChart = {
		id: "chart-123",
		query_id: null,
		organization_id: "org_123",
		tenant_id: "tenant_123",
		user_id: "user_123",
		title: "Revenue Chart",
		description: "Monthly revenue",
		vega_lite_spec: mockVegaLiteSpec,
		sql: "SELECT * FROM revenue",
		created_at: "2025-01-01T00:00:00Z",
		updated_at: "2025-01-01T00:00:00Z",
		target_db: "analytics",
		sql_params: null,
	};

	beforeEach(() => {
		service = new SavedChartService();
		mockAuth = {
			organizationId: "org_123",
			tenantId: "tenant_123",
			userId: "user_123",
			scopes: ["*"],
			roles: ["admin"],
			method: "jwt",
		};

		// Reset all mocks
		mockFrom.mockClear();
		mockSingle.mockReset();
	});

	describe("createChart", () => {
		test("should create a chart successfully", async () => {
			mockSingle.mockResolvedValueOnce({
				data: mockChart,
				error: null,
			});

			const result = await service.createChart(mockAuth, {
				title: "Revenue Chart",
				description: "Monthly revenue",
				sql: "SELECT * FROM revenue",
				vega_lite_spec: mockVegaLiteSpec,
				database: "analytics",
			});

			expect(result).toEqual(mockChart);
			expect(mockFrom).toHaveBeenCalledWith("sdk_charts");
		});

		test("should create a chart with optional fields", async () => {
			mockSingle.mockResolvedValueOnce({
				data: {
					...mockChart,
					query_id: "query-456",
					sql_params: { limit: 10 },
				},
				error: null,
			});

			const result = await service.createChart(mockAuth, {
				title: "Revenue Chart",
				sql: "SELECT * FROM revenue",
				vega_lite_spec: mockVegaLiteSpec,
				query_id: "query-456",
				sql_params: { limit: 10 },
			});

			expect(result.query_id).toBe("query-456");
			expect(result.sql_params).toEqual({ limit: 10 });
		});

		test("should throw error when insert fails", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { message: "Insert failed" },
			});

			await expect(
				service.createChart(mockAuth, {
					title: "Revenue Chart",
					sql: "SELECT * FROM revenue",
					vega_lite_spec: mockVegaLiteSpec,
				}),
			).rejects.toThrow("Failed to create chart: Insert failed");
		});
	});

	describe("listCharts", () => {
		test("should list charts with default pagination", async () => {
			const mockCharts = [
				{ ...mockChart, id: "chart-1", sdk_active_charts: [] },
				{
					...mockChart,
					id: "chart-2",
					sdk_active_charts: [{ id: "active-1" }],
				},
			];

			// Mock the count query
			mockQuery.select = mock(function () {
				return {
					...this,
					eq: mock(function () {
						return this;
					}),
					count: 2,
					error: null,
				};
			});

			// Mock the data query with proper chaining
			const mockOrderRange = mock(() =>
				Promise.resolve({ data: mockCharts, error: null }),
			);
			const mockOrder = mock(() => ({ range: mockOrderRange }));

			mockQuery.order = mockOrder;

			const result = await service.listCharts(mockAuth, {
				page: 1,
				limit: 10,
				sort_by: "created_at",
				sort_dir: "desc",
			});

			expect(result.data).toHaveLength(2);
			expect(result.data[0].active).toBe(false);
			expect(result.data[1].active).toBe(true);
			expect(result.pagination.page).toBe(1);
			expect(result.pagination.total).toBe(2);
		});

		test("should apply title filter", async () => {
			mockQuery.select = mock(function () {
				return {
					...this,
					eq: mock(function () {
						return this;
					}),
					ilike: mock(function (field: string, pattern: string) {
						expect(field).toBe("title");
						expect(pattern).toBe("%Revenue%");
						return this;
					}),
					count: 1,
					error: null,
				};
			});

			const mockOrderRange = mock(() =>
				Promise.resolve({ data: [mockChart], error: null }),
			);
			mockQuery.order = mock(() => ({ range: mockOrderRange }));

			await service.listCharts(mockAuth, {
				page: 1,
				limit: 10,
				sort_by: "created_at",
				sort_dir: "desc",
				title: "Revenue",
			});
		});

		test("should handle empty results", async () => {
			mockQuery.select = mock(function () {
				return {
					...this,
					eq: mock(function () {
						return this;
					}),
					count: 0,
					error: null,
				};
			});

			const mockOrderRange = mock(() =>
				Promise.resolve({ data: [], error: null }),
			);
			mockQuery.order = mock(() => ({ range: mockOrderRange }));

			const result = await service.listCharts(mockAuth, {
				page: 1,
				limit: 10,
				sort_by: "created_at",
				sort_dir: "desc",
			});

			expect(result.data).toHaveLength(0);
			expect(result.pagination.total).toBe(0);
			expect(result.pagination.totalPages).toBe(0);
		});

		test("should throw error when count fails", async () => {
			mockQuery.select = mock(function () {
				return {
					...this,
					eq: mock(function () {
						return this;
					}),
					count: null,
					error: { message: "Count failed" },
				};
			});

			await expect(
				service.listCharts(mockAuth, {
					page: 1,
					limit: 10,
					sort_by: "created_at",
					sort_dir: "desc",
				}),
			).rejects.toThrow("Failed to count charts: Count failed");
		});
	});

	describe("getChartById", () => {
		test("should get chart by ID successfully", async () => {
			const chartWithActive = {
				...mockChart,
				sdk_active_charts: [{ id: "active-1" }],
			};

			mockSingle.mockResolvedValueOnce({
				data: chartWithActive,
				error: null,
			});

			const result = await service.getChartById(mockAuth, "chart-123");

			expect(result).toBeDefined();
			expect(result?.id).toBe("chart-123");
			expect(result?.active).toBe(true);
		});

		test("should return null for non-existent chart", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "PGRST116", message: "Not found" },
			});

			const result = await service.getChartById(mockAuth, "non-existent");

			expect(result).toBeNull();
		});

		test("should throw error on database failure", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "OTHER", message: "Database error" },
			});

			await expect(service.getChartById(mockAuth, "chart-123")).rejects.toThrow(
				"Failed to get chart: Database error",
			);
		});

		test("should mark chart as inactive when no active charts", async () => {
			const chartWithoutActive = {
				...mockChart,
				sdk_active_charts: [],
			};

			mockSingle.mockResolvedValueOnce({
				data: chartWithoutActive,
				error: null,
			});

			const result = await service.getChartById(mockAuth, "chart-123");

			expect(result?.active).toBe(false);
		});
	});

	describe("updateChart", () => {
		test("should update chart successfully", async () => {
			const updatedChart = {
				...mockChart,
				title: "Updated Title",
				description: "Updated description",
			};

			mockSingle.mockResolvedValueOnce({
				data: updatedChart,
				error: null,
			});

			const result = await service.updateChart(mockAuth, "chart-123", {
				title: "Updated Title",
				description: "Updated description",
			});

			expect(result).toEqual(updatedChart);
			expect(result?.title).toBe("Updated Title");
		});

		test("should update only specified fields", async () => {
			const updatedChart = {
				...mockChart,
				sql: "SELECT * FROM updated_revenue",
			};

			mockSingle.mockResolvedValueOnce({
				data: updatedChart,
				error: null,
			});

			const result = await service.updateChart(mockAuth, "chart-123", {
				sql: "SELECT * FROM updated_revenue",
			});

			expect(result?.sql).toBe("SELECT * FROM updated_revenue");
		});

		test("should return null when chart not found", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "PGRST116", message: "Not found" },
			});

			const result = await service.updateChart(mockAuth, "non-existent", {
				title: "Updated",
			});

			expect(result).toBeNull();
		});

		test("should throw error on database failure", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { code: "OTHER", message: "Update failed" },
			});

			await expect(
				service.updateChart(mockAuth, "chart-123", { title: "Updated" }),
			).rejects.toThrow("Failed to update chart: Update failed");
		});

		test("should update all fields including optional ones", async () => {
			const updatedChart = {
				...mockChart,
				title: "New Title",
				description: "New description",
				sql: "SELECT * FROM new_table",
				sql_params: { limit: 50 },
				vega_lite_spec: { mark: "line", encoding: {} },
				target_db: "new_db",
			};

			mockSingle.mockResolvedValueOnce({
				data: updatedChart,
				error: null,
			});

			const result = await service.updateChart(mockAuth, "chart-123", {
				title: "New Title",
				description: "New description",
				sql: "SELECT * FROM new_table",
				sql_params: { limit: 50 },
				vega_lite_spec: { mark: "line", encoding: {} },
				database: "new_db",
			});

			expect(result).toEqual(updatedChart);
		});
	});

	describe("deleteChart", () => {
		test("should delete chart successfully", async () => {
			mockQuery.eq = mock(function (field: string, value: any) {
				if (field === "user_id") {
					return Promise.resolve({ data: null, error: null });
				}
				return this;
			});

			const result = await service.deleteChart(mockAuth, "chart-123");

			expect(result).toBe(true);
			expect(mockFrom).toHaveBeenCalledWith("sdk_charts");
		});

		test("should throw error when delete fails", async () => {
			mockQuery.eq = mock(function (field: string, value: any) {
				if (field === "user_id") {
					return Promise.resolve({
						data: null,
						error: { message: "Delete failed" },
					});
				}
				return this;
			});

			await expect(service.deleteChart(mockAuth, "chart-123")).rejects.toThrow(
				"Failed to delete chart: Delete failed",
			);
		});
	});
});
