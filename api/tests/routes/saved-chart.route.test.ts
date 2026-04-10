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
import { registerSavedChartRoutes } from "../../src/routes/saved-chart.route";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (savedChartService?: any) => {
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

	registerSavedChartRoutes(app, {
		savedChartService: savedChartService || {},
	});
	return app;
};

const mockVegaLiteSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	mark: "bar",
	data: { values: [] },
	encoding: {
		x: { field: "month", type: "ordinal" },
		y: { field: "revenue", type: "quantitative" },
	},
};

const mockChart = {
	id: "550e8400-e29b-41d4-a716-446655440000",
	query_id: null,
	organization_id: "org_123",
	tenant_id: "tenant_123",
	user_id: "user_123",
	title: "Revenue Chart",
	description: "Monthly revenue visualization",
	vega_lite_spec: mockVegaLiteSpec,
	sql: "SELECT month, revenue FROM revenue_stats",
	created_at: "2025-01-01T00:00:00Z",
	updated_at: "2025-01-01T00:00:00Z",
	target_db: "analytics",
	sql_params: null,
};

describe("POST /charts", () => {
	test("creates chart successfully", async () => {
		const mockCreateChart = mock(async () => mockChart);

		const app = createApp({ createChart: mockCreateChart });

		const res = await app.request("/charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Revenue Chart",
				description: "Monthly revenue visualization",
				sql: "SELECT month, revenue FROM revenue_stats",
				vega_lite_spec: mockVegaLiteSpec,
				database: "analytics",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.id).toBe(mockChart.id);
		expect(body.title).toBe("Revenue Chart");
		expect(mockCreateChart).toHaveBeenCalledTimes(1);
	});

	test("returns 400 for invalid request body", async () => {
		const app = createApp({ createChart: mock(async () => ({})) });

		const res = await app.request("/charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				// Missing required fields
				title: "",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid request body");
		expect(body.details).toBeDefined();
	});

	test("returns 500 for service errors", async () => {
		const mockCreateChart = mock(async () => {
			throw new Error("Database connection failed");
		});

		const app = createApp({ createChart: mockCreateChart });

		const res = await app.request("/charts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Revenue Chart",
				sql: "SELECT * FROM revenue",
				vega_lite_spec: mockVegaLiteSpec,
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Database connection failed");
	});
});

describe("GET /charts", () => {
	test("lists charts with pagination", async () => {
		const mockListCharts = mock(async () => ({
			data: [
				{ ...mockChart, active: true },
				{ ...mockChart, id: "another-id", active: false },
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

		const app = createApp({ listCharts: mockListCharts });

		const res = await app.request("/charts?page=1&limit=10", {
			method: "GET",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.data).toHaveLength(2);
		expect(body.pagination.total).toBe(2);
		expect(mockListCharts).toHaveBeenCalledTimes(1);
	});

	test("applies filters and sorting", async () => {
		const mockListCharts = mock(async () => ({
			data: [mockChart],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasNext: false,
				hasPrev: false,
			},
		}));

		const app = createApp({ listCharts: mockListCharts });

		const res = await app.request(
			"/charts?title=Revenue&sort_by=created_at&sort_dir=desc",
			{
				method: "GET",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(mockListCharts).toHaveBeenCalledTimes(1);

		const callArgs = mockListCharts.mock.calls[0][1];
		expect(callArgs.title).toBe("Revenue");
		expect(callArgs.sort_by).toBe("created_at");
		expect(callArgs.sort_dir).toBe("desc");
	});

	test("returns 400 for invalid query parameters", async () => {
		const app = createApp({ listCharts: mock(async () => ({})) });

		const res = await app.request("/charts?page=-1", {
			method: "GET",
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid query parameters");
	});

	test("returns 500 for service errors", async () => {
		const mockListCharts = mock(async () => {
			throw new Error("Database query failed");
		});

		const app = createApp({ listCharts: mockListCharts });

		const res = await app.request("/charts", {
			method: "GET",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Database query failed");
	});
});

describe("GET /charts/:id", () => {
	test("returns chart by id", async () => {
		const mockGetChartById = mock(async () => ({
			...mockChart,
			active: true,
		}));

		const app = createApp({ getChartById: mockGetChartById });

		const res = await app.request(
			"/charts/550e8400-e29b-41d4-a716-446655440000",
			{
				method: "GET",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.id).toBe(mockChart.id);
		expect(body.title).toBe("Revenue Chart");
		expect(body.active).toBe(true);
		expect(mockGetChartById).toHaveBeenCalledTimes(1);
	});

	test("returns 404 when chart not found", async () => {
		const mockGetChartById = mock(async () => null);

		const app = createApp({ getChartById: mockGetChartById });

		const res = await app.request("/charts/nonexistent-id", {
			method: "GET",
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Chart not found");
	});

	test("returns 500 for service errors", async () => {
		const mockGetChartById = mock(async () => {
			throw new Error("Database error");
		});

		const app = createApp({ getChartById: mockGetChartById });

		const res = await app.request("/charts/some-id", {
			method: "GET",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Database error");
	});
});

describe("PUT /charts/:id", () => {
	test("updates chart successfully", async () => {
		const updatedChart = {
			...mockChart,
			title: "Updated Revenue Chart",
			updated_at: "2025-01-02T00:00:00Z",
		};
		const mockUpdateChart = mock(async () => updatedChart);

		const app = createApp({ updateChart: mockUpdateChart });

		const res = await app.request(
			"/charts/550e8400-e29b-41d4-a716-446655440000",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: "Updated Revenue Chart",
				}),
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.title).toBe("Updated Revenue Chart");
		expect(mockUpdateChart).toHaveBeenCalledTimes(1);
	});

	test("returns 404 when chart not found", async () => {
		const mockUpdateChart = mock(async () => null);

		const app = createApp({ updateChart: mockUpdateChart });

		const res = await app.request("/charts/nonexistent-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "New Title",
			}),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Chart not found");
	});

	test("returns 400 for invalid request body", async () => {
		const app = createApp({ updateChart: mock(async () => ({})) });

		const res = await app.request("/charts/some-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "", // Empty title not allowed
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid request body");
	});

	test("returns 500 for service errors", async () => {
		const mockUpdateChart = mock(async () => {
			throw new Error("Update failed");
		});

		const app = createApp({ updateChart: mockUpdateChart });

		const res = await app.request("/charts/some-id", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "New Title",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Update failed");
	});
});

describe("DELETE /charts/:id", () => {
	test("deletes chart successfully", async () => {
		const mockDeleteChart = mock(async () => true);

		const app = createApp({ deleteChart: mockDeleteChart });

		const res = await app.request(
			"/charts/550e8400-e29b-41d4-a716-446655440000",
			{
				method: "DELETE",
			},
		);

		expect(res.status).toBe(204);
		expect(mockDeleteChart).toHaveBeenCalledTimes(1);
	});

	test("returns 500 for service errors", async () => {
		const mockDeleteChart = mock(async () => {
			throw new Error("Delete failed");
		});

		const app = createApp({ deleteChart: mockDeleteChart });

		const res = await app.request("/charts/some-id", {
			method: "DELETE",
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Delete failed");
	});
});
