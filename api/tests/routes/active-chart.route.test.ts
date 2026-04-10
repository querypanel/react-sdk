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
import { registerActiveChartRoutes } from "../../src/routes/active-chart.route";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (activeChartService?: any) => {
	const app = new Hono();

	// Use test auth middleware with custom context
	app.use(
		"*",
		createTestAuthMiddleware({
			organizationId: "org_123",
			tenantId: "tenant_123",
			userId: "user_123",
		}),
	);

	registerActiveChartRoutes(app, {
		activeChartService: activeChartService || {},
	});
	return app;
};

const mockActiveChart = {
	id: "active-chart-123",
	organization_id: "org_123",
	tenant_id: "tenant_123",
	user_id: "user_123",
	chart_id: "550e8400-e29b-41d4-a716-446655440000",
	order: 1,
	meta: { dashboard: "main" },
	created_at: "2025-01-01T00:00:00Z",
	updated_at: "2025-01-01T00:00:00Z",
};

const mockChartData = {
	id: "550e8400-e29b-41d4-a716-446655440000",
	title: "Revenue Chart",
	sql: "SELECT * FROM revenue",
};

describe("POST /active-charts", () => {
	test("creates active chart successfully", async () => {
		const mockCreateActiveChart = mock(async () => mockActiveChart);

		const app = createApp({ createActiveChart: mockCreateActiveChart });

		const res = await app.request("/active-charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chart_id: "550e8400-e29b-41d4-a716-446655440000",
				order: 1,
				meta: { dashboard: "main" },
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.id).toBe(mockActiveChart.id);
		expect(body.chart_id).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(mockCreateActiveChart).toHaveBeenCalledTimes(1);
	});

	test("returns 400 for invalid chart_id", async () => {
		const app = createApp({ createActiveChart: mock(async () => ({})) });

		const res = await app.request("/active-charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chart_id: "not-a-uuid",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid request body");
		expect(body.details).toBeDefined();
	});

	test("returns 500 for service errors", async () => {
		const mockCreateActiveChart = mock(async () => {
			throw new Error("tenantId is required");
		});

		const app = createApp({ createActiveChart: mockCreateActiveChart });

		const res = await app.request("/active-charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chart_id: "550e8400-e29b-41d4-a716-446655440000",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("tenantId is required");
	});
});

describe("GET /active-charts", () => {
	test("lists active charts with pagination", async () => {
		const mockListActiveCharts = mock(async () => ({
			data: [
				{ ...mockActiveChart, chart: mockChartData },
				{
					...mockActiveChart,
					id: "active-chart-456",
					chart: { ...mockChartData, id: "another-chart-id" },
				},
			],
			pagination: {
				page: 1,
				limit: 10,
				total: 2,
				totalPages: 1,
				hasNext: false,
				hasPrev: false,
			},
		}));

		const app = createApp({ listActiveCharts: mockListActiveCharts });

		const res = await app.request("/active-charts?page=1&limit=10", {
			method: "GET",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.data).toHaveLength(2);
		expect(body.data[0].chart).toBeDefined();
		expect(body.pagination.total).toBe(2);
		expect(mockListActiveCharts).toHaveBeenCalledTimes(1);
	});

	test("applies filters and sorting", async () => {
		const mockListActiveCharts = mock(async () => ({
			data: [{ ...mockActiveChart, chart: mockChartData }],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasNext: false,
				hasPrev: false,
			},
		}));

		const app = createApp({ listActiveCharts: mockListActiveCharts });

		const res = await app.request(
			"/active-charts?title=Revenue&sort_by=created_at&sort_dir=asc",
			{
				method: "GET",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(mockListActiveCharts).toHaveBeenCalledTimes(1);

		const callArgs = mockListActiveCharts.mock.calls[0][1];
		expect(callArgs.title).toBe("Revenue");
		expect(callArgs.sort_by).toBe("created_at");
		expect(callArgs.sort_dir).toBe("asc");
	});

	test("returns 400 for invalid query parameters", async () => {
		const app = createApp({ listActiveCharts: mock(async () => ({})) });

		const res = await app.request("/active-charts?limit=1000", {
			method: "GET",
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid query parameters");
	});

	test("returns 500 for service errors", async () => {
		const mockListActiveCharts = mock(async () => {
			throw new Error("organizationId is required");
		});

		const app = createApp({ listActiveCharts: mockListActiveCharts });

		const res = await app.request("/active-charts", {
			method: "GET",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("organizationId is required");
	});
});

describe("GET /active-charts/:id", () => {
	test("returns active chart by id", async () => {
		const mockGetActiveChartById = mock(async () => ({
			...mockActiveChart,
			chart: mockChartData,
		}));

		const app = createApp({ getActiveChartById: mockGetActiveChartById });

		const res = await app.request("/active-charts/active-chart-123", {
			method: "GET",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.id).toBe(mockActiveChart.id);
		expect(body.chart).toBeDefined();
		expect(body.chart.title).toBe("Revenue Chart");
		expect(mockGetActiveChartById).toHaveBeenCalledTimes(1);
	});

	test("returns 404 when active chart not found", async () => {
		const mockGetActiveChartById = mock(async () => null);

		const app = createApp({ getActiveChartById: mockGetActiveChartById });

		const res = await app.request("/active-charts/nonexistent-id", {
			method: "GET",
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Active chart not found");
	});

	test("returns 500 for service errors", async () => {
		const mockGetActiveChartById = mock(async () => {
			throw new Error("Database error");
		});

		const app = createApp({ getActiveChartById: mockGetActiveChartById });

		const res = await app.request("/active-charts/some-id", {
			method: "GET",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Database error");
	});
});

describe("PUT /active-charts/:id", () => {
	test("updates active chart successfully", async () => {
		const updatedActiveChart = {
			...mockActiveChart,
			order: 2,
			updated_at: "2025-01-02T00:00:00Z",
		};
		const mockUpdateActiveChart = mock(async () => updatedActiveChart);

		const app = createApp({ updateActiveChart: mockUpdateActiveChart });

		const res = await app.request("/active-charts/active-chart-123", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				order: 2,
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.order).toBe(2);
		expect(mockUpdateActiveChart).toHaveBeenCalledTimes(1);
	});

	test("returns 404 when active chart not found", async () => {
		const mockUpdateActiveChart = mock(async () => null);

		const app = createApp({ updateActiveChart: mockUpdateActiveChart });

		const res = await app.request("/active-charts/nonexistent-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				order: 5,
			}),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Active chart not found");
	});

	test("returns 400 for invalid chart_id", async () => {
		const app = createApp({ updateActiveChart: mock(async () => ({})) });

		const res = await app.request("/active-charts/some-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chart_id: "not-a-uuid",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid request body");
	});

	test("returns 500 for service errors", async () => {
		const mockUpdateActiveChart = mock(async () => {
			throw new Error("Update failed");
		});

		const app = createApp({ updateActiveChart: mockUpdateActiveChart });

		const res = await app.request("/active-charts/some-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				order: 3,
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Update failed");
	});
});

describe("DELETE /active-charts/:id", () => {
	test("deletes active chart successfully", async () => {
		const mockDeleteActiveChart = mock(async () => true);

		const app = createApp({ deleteActiveChart: mockDeleteActiveChart });

		const res = await app.request("/active-charts/active-chart-123", {
			method: "DELETE",
		});

		expect(res.status).toBe(204);
		expect(mockDeleteActiveChart).toHaveBeenCalledTimes(1);
	});

	test("returns 500 for service errors", async () => {
		const mockDeleteActiveChart = mock(async () => {
			throw new Error("Delete failed");
		});

		const app = createApp({ deleteActiveChart: mockDeleteActiveChart });

		const res = await app.request("/active-charts/some-id", {
			method: "DELETE",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Delete failed");
	});
});
