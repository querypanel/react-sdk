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

import { ActiveChartService } from "../../src/services/active-chart.service";
import type { AuthContext } from "../../src/types/auth";

describe("ActiveChartService", () => {
	let service: ActiveChartService;
	let mockAuth: AuthContext;

	const mockActiveChart = {
		id: "active-123",
		organization_id: "org_123",
		tenant_id: "tenant_123",
		user_id: "user_123",
		chart_id: "chart-456",
		order: 1,
		meta: { dashboard: "main" },
		created_at: "2025-01-01T00:00:00Z",
		updated_at: "2025-01-01T00:00:00Z",
	};

	beforeEach(() => {
		service = new ActiveChartService();
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

	describe("createActiveChart", () => {
		test("should create active chart successfully", async () => {
			mockSingle.mockResolvedValueOnce({
				data: mockActiveChart,
				error: null,
			});

			const result = await service.createActiveChart(mockAuth, {
				chart_id: "chart-456",
				order: 1,
				meta: { dashboard: "main" },
			});

			expect(result).toEqual(mockActiveChart);
			expect(mockFrom).toHaveBeenCalledWith("sdk_active_charts");
		});

		test("should create active chart with minimal fields", async () => {
			const minimalActiveChart = {
				...mockActiveChart,
				order: null,
				meta: null,
			};

			mockSingle.mockResolvedValueOnce({
				data: minimalActiveChart,
				error: null,
			});

			const result = await service.createActiveChart(mockAuth, {
				chart_id: "chart-456",
			});

			expect(result.chart_id).toBe("chart-456");
			expect(result.order).toBeNull();
			expect(result.meta).toBeNull();
		});

		test("should throw error when organizationId is missing", async () => {
			const authWithoutOrg = { ...mockAuth, organizationId: undefined };

			await expect(
				service.createActiveChart(authWithoutOrg, {
					chart_id: "chart-456",
				}),
			).rejects.toThrow("organizationId is required");
		});

		test("should throw error when tenantId is missing", async () => {
			const authWithoutTenant = { ...mockAuth, tenantId: undefined };

			await expect(
				service.createActiveChart(authWithoutTenant, {
					chart_id: "chart-456",
				}),
			).rejects.toThrow("tenantId is required");
		});

		test("should throw error when insert fails", async () => {
			mockSingle.mockResolvedValueOnce({
				data: null,
				error: { message: "Insert failed" },
			});

			await expect(
				service.createActiveChart(mockAuth, {
					chart_id: "chart-456",
				}),
			).rejects.toThrow("Failed to create active chart: Insert failed");
		});
	});

	describe("deleteActiveChart", () => {
		test("should delete active chart successfully", async () => {
			mockQuery.eq = mock(function (field: string, value: any) {
				if (field === "tenant_id") {
					return Promise.resolve({ data: null, error: null });
				}
				return this;
			});

			const result = await service.deleteActiveChart(mockAuth, "active-123");

			expect(result).toBe(true);
			expect(mockFrom).toHaveBeenCalledWith("sdk_active_charts");
		});

		test("should throw error when organizationId is missing", async () => {
			const authWithoutOrg = { ...mockAuth, organizationId: undefined };

			await expect(
				service.deleteActiveChart(authWithoutOrg, "active-123"),
			).rejects.toThrow("organizationId is required");
		});

		test("should throw error when tenantId is missing", async () => {
			const authWithoutTenant = { ...mockAuth, tenantId: undefined };

			await expect(
				service.deleteActiveChart(authWithoutTenant, "active-123"),
			).rejects.toThrow("tenantId is required");
		});

		test("should throw error when delete fails", async () => {
			mockQuery.eq = mock(function (field: string, value: any) {
				if (field === "tenant_id") {
					return Promise.resolve({
						data: null,
						error: { message: "Delete failed" },
					});
				}
				return this;
			});

			await expect(
				service.deleteActiveChart(mockAuth, "active-123"),
			).rejects.toThrow("Failed to delete active chart: Delete failed");
		});
	});
});
