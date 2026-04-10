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
import { registerChartRoutes } from "../../src/routes/chart.route";
import { ChartValidationError } from "../../src/services/chart-validator.service";
import type { AppContext } from "../../src/types/app";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (generateWithRetryImpl: ReturnType<typeof mock>) => {
	const app = new Hono<AppContext>();
	// Use test auth middleware to set auth context
	app.use("*", createTestAuthMiddleware());
	registerChartRoutes(app, {
		chartGenerator: { generateWithRetry: generateWithRetryImpl } as any,
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

const chartSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	mark: "bar",
	data: { values: [] },
	encoding: {
		x: { field: "month", type: "ordinal" },
		y: { field: "revenue", type: "quantitative" },
	},
};

describe("POST /chart", () => {
	test("returns chart specification on success", async () => {
		const mockGenerate = mock(async () => ({
			chart: chartSpec,
			notes: "Trend analysis using line chart",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			max_retries: 2,
		};

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.chart).toEqual(chartSpec);
		expect(body.notes).toBe("Trend analysis using line chart");

		expect(mockGenerate).toHaveBeenCalledTimes(1);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.question).toBe(baseRequest.question);
		expect(input.sql).toBe(baseRequest.sql);
		expect(input.rationale).toBe(baseRequest.rationale);
		expect(input.fields).toEqual(baseRequest.fields);
		expect(input.rows).toEqual(baseRequest.rows);
		expect(input.maxRetries).toBe(2);
	});

	test("returns 400 when chart validation fails", async () => {
		const mockGenerate = mock(async () => {
			throw new ChartValidationError("Invalid encoding", { channel: "x" });
		});

		const app = createApp(mockGenerate);

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toBe("Invalid encoding");
		expect(body.validation.details).toEqual({ channel: "x" });
	});

	test("returns 500 for unexpected errors", async () => {
		const mockGenerate = mock(async () => {
			throw new Error("LLM unavailable");
		});

		const app = createApp(mockGenerate);

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.error).toBe("LLM unavailable");
	});

	test("passes encoding_hints to chart generator", async () => {
		const mockGenerate = mock(async () => ({
			chart: chartSpec,
			notes: "Chart with hints",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				chartType: "bar",
				xAxis: { field: "month", timeUnit: "month" },
				yAxis: { field: "revenue", aggregate: "sum" },
				limit: 50,
			},
		};

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(res.status).toBe(200);
		expect(mockGenerate).toHaveBeenCalledTimes(1);

		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints).toBeDefined();
		expect(input.encodingHints.chartType).toBe("bar");
		expect(input.encodingHints.xAxis.field).toBe("month");
		expect(input.encodingHints.yAxis.aggregate).toBe("sum");
		expect(input.encodingHints.limit).toBe(50);
	});

	test("accepts request without encoding_hints", async () => {
		const mockGenerate = mock(async () => ({
			chart: chartSpec,
			notes: "Chart without hints",
		}));

		const app = createApp(mockGenerate);

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(baseRequest),
		});

		expect(res.status).toBe(200);
		const input = mockGenerate.mock.calls[0]![0];
		expect(input.encodingHints).toBeUndefined();
	});

	test("validates encoding_hints chartType enum", async () => {
		const mockGenerate = mock(async () => ({
			chart: chartSpec,
			notes: "Test",
		}));

		const app = createApp(mockGenerate);
		const requestBody = {
			...baseRequest,
			encoding_hints: {
				chartType: "invalid_chart_type",
			},
		};

		const res = await app.request("/chart", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		// Should reject invalid enum value
		expect(res.status).toBe(500); // Zod validation throws
	});
});
