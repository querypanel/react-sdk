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
import { registerVizSpecRoutes } from "../../src/routes/vizspec.route";
import { VizSpecValidationError } from "../../src/services/vizspec-generator.service";
import type { AppContext } from "../../src/types/app";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (generateWithRetryImpl: ReturnType<typeof mock>) => {
	const app = new Hono<AppContext>();
	app.use("*", createTestAuthMiddleware());
	registerVizSpecRoutes(app, {
		vizspecGenerator: { generateWithRetry: generateWithRetryImpl } as any,
		sqlLogService: {
			updateToSuccess: mock(async () => {}),
		} as any,
		autoEvalService: {
			evaluateE2E: mock(async () => {}),
		} as any,
	});
	return app;
};

const baseRequest = {
	question: "How does revenue trend over time?",
	sql: "SELECT month, revenue FROM revenue_stats",
	rationale: "Show revenue trends",
	fields: ["month", "revenue"],
	rows: [{ month: "date", revenue: "number" }],
};

const vizSpec = {
	version: "1.0" as const,
	kind: "chart" as const,
	title: "Revenue Trend",
	data: { sourceId: "main_query" },
	encoding: {
		chartType: "line" as const,
		x: { field: "month", type: "temporal" as const },
		y: { field: "revenue", type: "quantitative" as const },
	},
};

describe("POST /vizspec", () => {
	test("returns VizSpec on success", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Line chart for time series",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			max_retries: 2,
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.spec).toEqual(vizSpec);
		expect(body.notes).toBe("Line chart for time series");

		expect(mockGenerate).toHaveBeenCalledTimes(1);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.question).toBe(baseRequest.question);
		expect(input.sql).toBe(baseRequest.sql);
		expect(input.rationale).toBe(baseRequest.rationale);
		expect(input.fields).toEqual(baseRequest.fields);
		expect(input.rows).toEqual(baseRequest.rows);
		expect(input.maxRetries).toBe(2);
	});

	test("returns 400 when VizSpec validation fails", async () => {
		const mockGenerate = mock(async () => {
			throw new VizSpecValidationError("Invalid encoding", { field: "x" });
		});

		const app = createApp(mockGenerate);

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid encoding");
		expect(body.validation.details).toEqual({ field: "x" });
	});

	test("returns 500 for unexpected errors", async () => {
		const mockGenerate = mock(async () => {
			throw new Error("LLM unavailable");
		});

		const app = createApp(mockGenerate);

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("LLM unavailable");
	});

	test("passes encoding_hints to vizspec generator", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "VizSpec with hints",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				kind: "chart",
				chartType: "bar",
				xAxis: { field: "month", timeUnit: "month" },
				yAxis: { field: "revenue", aggregate: "sum" },
				series: { field: "region" },
				stacking: "stacked",
				limit: 100,
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		expect(mockGenerate).toHaveBeenCalledTimes(1);

		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints).toBeDefined();
		expect(input.encodingHints.kind).toBe("chart");
		expect(input.encodingHints.chartType).toBe("bar");
		expect(input.encodingHints.xAxis.field).toBe("month");
		expect(input.encodingHints.xAxis.timeUnit).toBe("month");
		expect(input.encodingHints.yAxis.aggregate).toBe("sum");
		expect(input.encodingHints.series.field).toBe("region");
		expect(input.encodingHints.stacking).toBe("stacked");
		expect(input.encodingHints.limit).toBe(100);
	});

	test("accepts request without encoding_hints", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "VizSpec without hints",
		}));

		const app = createApp(mockGenerate);

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(200);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints).toBeUndefined();
	});

	test("accepts multiple y-axis fields in encoding_hints", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Multi-axis chart",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				chartType: "line",
				yAxis: [
					{ field: "revenue", aggregate: "sum" },
					{ field: "cost", aggregate: "sum" },
				],
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints.yAxis).toHaveLength(2);
		expect(input.encodingHints.yAxis[0].field).toBe("revenue");
		expect(input.encodingHints.yAxis[1].field).toBe("cost");
	});

	test("accepts column chart type in encoding_hints", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Column chart",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				chartType: "column",
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints.chartType).toBe("column");
	});

	test("forwards supported_chart_types to generator", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Test",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			supported_chart_types: ["line", "bar", "column", "pie"],
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.supportedChartTypes).toEqual([
			"line",
			"bar",
			"column",
			"pie",
		]);
	});

	test("forwards encoding_hints and supported_chart_types even when hint chartType is not in the allowed list", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Test",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			supported_chart_types: ["line", "column"],
			encoding_hints: {
				chartType: "area",
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		expect(mockGenerate).toHaveBeenCalledTimes(1);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.supportedChartTypes).toEqual(["line", "column"]);
		expect(input.encodingHints?.chartType).toBe("area");
	});

	test("validates encoding_hints chartType enum", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Test",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				chartType: "invalid_chart_type",
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		// Should reject invalid enum value
		expect(res.status).toBe(400);
	});

	test("validates encoding_hints stacking enum", async () => {
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Test",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				stacking: "invalid_stacking",
			},
		};

		const res = await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		// Should reject invalid enum value
		expect(res.status).toBe(400);
	});

	test("updates SQL log to SUCCESS on success", async () => {
		const updateToSuccessMock = mock(async () => {});
		const mockGenerate = mock(async () => ({
			spec: vizSpec,
			notes: "Success",
		}));

		const app = new Hono<AppContext>();
		app.use("*", createTestAuthMiddleware());
		registerVizSpecRoutes(app, {
			vizspecGenerator: { generateWithRetry: mockGenerate } as any,
			sqlLogService: {
				updateToSuccess: updateToSuccessMock,
			} as any,
			autoEvalService: {
				evaluateE2E: mock(async () => {}),
			} as any,
		});

		const requestBody = {
			...baseRequest,
			query_id: "550e8400-e29b-41d4-a716-446655440000",
		};

		await app.request("/vizspec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(updateToSuccessMock).toHaveBeenCalledWith(
			"550e8400-e29b-41d4-a716-446655440000",
		);
	});
});
