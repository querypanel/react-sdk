import "../helpers/config.helper";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { config } from "../../src/config";
import { AutoEvalService } from "../../src/services/auto-eval.service";

describe("AutoEvalService", () => {
	beforeEach(() => {
		// Enable auto-eval in test runtime (config is a mutable object)
		(config as any).autoEval.enabled = true;
		(config as any).autoEval.sampleRate = 1;
		(config as any).autoEval.judgeModel = "gpt-4o-mini";
		(config as any).autoEval.timeoutMs = undefined;
	});

	test("skips when sampleRate=0", async () => {
		(config as any).autoEval.sampleRate = 0;

		const service = new AutoEvalService();

		const judgeInvoke = mock(async () => {
			throw new Error("should not be called");
		});
		(service as any).judgeModel = { invoke: judgeInvoke };

		(service as any).langfuse = {
			prompt: {
				get: mock(async () => {
					throw new Error("should not be called");
				}),
			},
			score: {
				trace: mock(() => {}),
				flush: mock(async () => {}),
			},
		};

		await service.evaluateE2E({
			organizationId: "org-1",
			tenantId: "tenant-1",
			sessionId: "session-1",
			queryId: "query-1",
			question: "Top countries by revenue",
			sql: "SELECT country, SUM(revenue) AS revenue FROM orders GROUP BY 1",
			fields: ["country", "revenue"],
			schemaRows: [{ country: "string", revenue: "number" }],
			vegaLiteSpec: {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
			},
			target: "chart",
		});

		expect(judgeInvoke).toHaveBeenCalledTimes(0);
	});

	test("creates 4 scores on successful judge parse", async () => {
		const service = new AutoEvalService();

		const judgeInvoke = mock(async () => {
			return {
				content: JSON.stringify({
					scores: {
						e2e_answer_relevance: 0.9,
						sql_safety: 1,
						viz_consistency: 0.8,
						viz_best_practice: 0.7,
					},
					rationales: {
						e2e_answer_relevance: "Answers the question.",
						sql_safety: "SELECT-only.",
						viz_consistency: "Fields align with encodings.",
						viz_best_practice: "Reasonable defaults.",
					},
				}),
			};
		});

		const scoreTrace = mock(() => {});
		const scoreFlush = mock(async () => {});

		(service as any).judgeModel = { invoke: judgeInvoke };
		(service as any).langfuse = {
			prompt: {
				get: mock(async () => {
					return {
						name: "The Judge",
						version: 1,
						isFallback: false,
						compile: mock(() => [
							{ role: "system", content: "You are The Judge." },
							{ role: "user", content: "Evaluate." },
						]),
					};
				}),
			},
			score: {
				trace: scoreTrace,
				flush: scoreFlush,
			},
		};

		await service.evaluateE2E({
			organizationId: "org-1",
			tenantId: "tenant-1",
			sessionId: "session-1",
			queryId: "query-1",
			question: "Top countries by revenue",
			sql: "SELECT country, SUM(revenue) AS revenue FROM orders GROUP BY 1",
			fields: ["country", "revenue"],
			schemaRows: [{ country: "string", revenue: "number" }],
			vegaLiteSpec: {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
			},
			target: "chart",
		});

		expect(judgeInvoke).toHaveBeenCalledTimes(1);
		expect(scoreTrace).toHaveBeenCalledTimes(4);
		expect(scoreFlush).toHaveBeenCalledTimes(1);
	});

	test("handles invalid judge output without throwing", async () => {
		const service = new AutoEvalService();

		const judgeInvoke = mock(async () => {
			return { content: "not-json" };
		});

		const scoreTrace = mock(() => {});
		const scoreFlush = mock(async () => {});

		(service as any).judgeModel = { invoke: judgeInvoke };
		(service as any).langfuse = {
			prompt: {
				get: mock(async () => {
					return {
						name: "The Judge",
						version: 1,
						isFallback: false,
						compile: mock(() => [
							{ role: "system", content: "You are The Judge." },
							{ role: "user", content: "Evaluate." },
						]),
					};
				}),
			},
			score: {
				trace: scoreTrace,
				flush: scoreFlush,
			},
		};

		await service.evaluateE2E({
			organizationId: "org-1",
			tenantId: "tenant-1",
			sessionId: "session-1",
			queryId: "query-1",
			question: "Top countries by revenue",
			sql: "SELECT country, SUM(revenue) AS revenue FROM orders GROUP BY 1",
			fields: ["country", "revenue"],
			schemaRows: [{ country: "string", revenue: "number" }],
			vegaLiteSpec: {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
			},
			target: "chart",
		});

		expect(judgeInvoke).toHaveBeenCalledTimes(1);
		expect(scoreTrace).toHaveBeenCalledTimes(0);
		expect(scoreFlush).toHaveBeenCalledTimes(0);
	});
});
