import { createLogger } from "./logger";

const logger = createLogger("pipeline");

/**
 * Timing information for a single pipeline step.
 */
export interface StepTiming {
	step: string;
	startedAt: number;
	endedAt: number;
	durationMs: number;
}

/**
 * Full pipeline trace returned alongside the result.
 */
export interface PipelineTrace {
	steps: StepTiming[];
	totalDurationMs: number;
}

/**
 * A pipeline step: a named async function that transforms state S → S.
 */
export interface PipelineStep<S> {
	name: string;
	run: (state: S) => Promise<S>;
}

/**
 * Merge multiple pipeline traces into one (for multi-phase pipelines).
 */
export function mergeTraces(...traces: PipelineTrace[]): PipelineTrace {
	const steps = traces.flatMap((t) => t.steps);
	const totalDurationMs = traces.reduce((sum, t) => sum + t.totalDurationMs, 0);
	return { steps, totalDurationMs };
}

/**
 * Executes an ordered list of pipeline steps sequentially,
 * recording wall-clock timing for each step.
 *
 * This replaces the LangChain RunnableSequence approach with a
 * straightforward, observable, typed pipeline.
 */
export async function runPipeline<S>(
	steps: PipelineStep<S>[],
	initialState: S,
): Promise<{ state: S; trace: PipelineTrace }> {
	const timings: StepTiming[] = [];
	const pipelineStart = performance.now();
	let state = initialState;

	for (const step of steps) {
		const start = performance.now();
		logger.debug({ step: step.name }, "Pipeline step starting");
		try {
			state = await step.run(state);
		} catch (err) {
			const end = performance.now();
			timings.push({
				step: step.name,
				startedAt: start,
				endedAt: end,
				durationMs: Math.round(end - start),
			});
			logger.error(
				{ step: step.name, durationMs: Math.round(end - start), err },
				"Pipeline step failed",
			);
			// Attach partial trace to the error so callers can inspect it
			(err as any).__pipelineTrace = {
				steps: timings,
				totalDurationMs: Math.round(end - pipelineStart),
			} satisfies PipelineTrace;
			throw err;
		}
		const end = performance.now();
		const durationMs = Math.round(end - start);
		timings.push({ step: step.name, startedAt: start, endedAt: end, durationMs });
		logger.debug({ step: step.name, durationMs }, "Pipeline step completed");
	}

	const totalDurationMs = Math.round(performance.now() - pipelineStart);
	logger.info(
		{
			totalDurationMs,
			steps: timings.map((t) => `${t.step}(${t.durationMs}ms)`).join(" → "),
		},
		"Pipeline completed",
	);

	return {
		state,
		trace: { steps: timings, totalDurationMs },
	};
}
