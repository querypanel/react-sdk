import { describe, expect, test } from "bun:test";

// Mock config before importing pipeline
import { mock } from "bun:test";
mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: { url: "https://test.supabase.co", serviceRoleKey: "test-key" },
		openai: { apiKey: "test-key" },
		models: {
			sqlGenerator: "gpt-4o-mini",
			chartGenerator: "gpt-4o-mini",
			guardrail: "gpt-4o-mini",
			moderation: "omni-moderation-latest",
		},
		autoEval: { enabled: false, sampleRate: 0.05, judgeModel: "gpt-4o-mini" },
		database: { tableName: "schema_chunks", queryName: "match_documents" },
		auth: { serviceApiKey: "test-api-key" },
		langfuse: { enabled: false },
	},
}));

import { runPipeline, type PipelineStep } from "../../src/lib/pipeline";

interface TestState {
	value: number;
	log: string[];
}

describe("runPipeline", () => {
	test("runs steps sequentially and records timings", async () => {
		const steps: PipelineStep<TestState>[] = [
			{
				name: "step_one",
				run: async (s) => ({
					value: s.value + 1,
					log: [...s.log, "one"],
				}),
			},
			{
				name: "step_two",
				run: async (s) => ({
					value: s.value * 10,
					log: [...s.log, "two"],
				}),
			},
		];

		const { state, trace } = await runPipeline(steps, {
			value: 1,
			log: [],
		});

		expect(state.value).toBe(20); // (1 + 1) * 10
		expect(state.log).toEqual(["one", "two"]);
		expect(trace.steps).toHaveLength(2);
		expect(trace.steps[0].step).toBe("step_one");
		expect(trace.steps[1].step).toBe("step_two");
		expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
		for (const step of trace.steps) {
			expect(step.durationMs).toBeGreaterThanOrEqual(0);
		}
	});

	test("attaches partial trace to errors", async () => {
		const steps: PipelineStep<TestState>[] = [
			{
				name: "ok_step",
				run: async (s) => ({ ...s, log: [...s.log, "ok"] }),
			},
			{
				name: "failing_step",
				run: async () => {
					throw new Error("boom");
				},
			},
			{
				name: "never_reached",
				run: async (s) => s,
			},
		];

		try {
			await runPipeline(steps, { value: 0, log: [] });
			expect(true).toBe(false); // should not reach
		} catch (err: any) {
			expect(err.message).toBe("boom");
			expect(err.__pipelineTrace).toBeDefined();
			expect(err.__pipelineTrace.steps).toHaveLength(2);
			expect(err.__pipelineTrace.steps[0].step).toBe("ok_step");
			expect(err.__pipelineTrace.steps[1].step).toBe("failing_step");
		}
	});

	test("handles empty steps array", async () => {
		const { state, trace } = await runPipeline<TestState>([], {
			value: 42,
			log: [],
		});

		expect(state.value).toBe(42);
		expect(trace.steps).toHaveLength(0);
		expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
	});
});
