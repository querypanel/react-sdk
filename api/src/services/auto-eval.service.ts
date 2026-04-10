import { ChatOpenAI } from "@langchain/openai";
import { LangfuseClient } from "@langfuse/client";
import { startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";
import { config } from "../config";
import { createLogger } from "../lib/logger";

const logger = createLogger("auto-eval");

type E2ETarget = "chart" | "vizspec";

const JUDGE_PROMPT_NAME = "The Judge";

export type AutoEvalE2EInput = {
	organizationId: string;
	tenantId?: string;
	sessionId?: string;
	queryId?: string;
	question: string;
	sql: string;
	dialect?: string;
	fields: string[];
	/**
	 * Anonymized schema rows (types only), e.g. [{ month: "date", revenue: "number" }].
	 * Do NOT pass raw query result rows here.
	 */
	schemaRows: Array<Record<string, unknown>>;
	/**
	 * Vega-Lite spec (server-side: should have data.values = []).
	 */
	vegaLiteSpec?: Record<string, unknown> | null;
	/**
	 * VizSpec object.
	 */
	vizSpec?: Record<string, unknown> | null;
	target: E2ETarget;
};

type JudgeResult = {
	scores: {
		e2e_answer_relevance: number;
		sql_safety: number;
		viz_consistency: number;
		viz_best_practice: number;
	};
	rationales: {
		e2e_answer_relevance: string;
		sql_safety: string;
		viz_consistency: string;
		viz_best_practice: string;
	};
};

const judgeResultSchema = z.object({
	scores: z.object({
		e2e_answer_relevance: z.number(),
		sql_safety: z.number(),
		viz_consistency: z.number(),
		viz_best_practice: z.number(),
	}),
	rationales: z.object({
		e2e_answer_relevance: z.string(),
		sql_safety: z.string(),
		viz_consistency: z.string(),
		viz_best_practice: z.string(),
	}),
});

type JudgeResultParsed = z.infer<typeof judgeResultSchema>;

function shouldSample(sampleRate: number): boolean {
	if (sampleRate <= 0) return false;
	if (sampleRate >= 1) return true;
	return Math.random() < sampleRate;
}

function clamp01(n: number): number {
	if (Number.isNaN(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

function buildJudgePromptVariables(
	input: AutoEvalE2EInput,
): Record<string, string> {
	const specPayload =
		input.target === "chart"
			? {
					vegaLiteSpec: input.vegaLiteSpec ?? null,
				}
			: {
					vizSpec: input.vizSpec ?? null,
				};

	return {
		target: input.target,
		question: input.question,
		sql: input.sql,
		dialect: input.dialect ?? "unknown",
		fields_json: JSON.stringify(input.fields),
		schema_json: JSON.stringify(input.schemaRows?.[0] ?? {}),
		spec_json: JSON.stringify(specPayload),
	};
}

function toChatMessages(
	compiled: unknown,
): Array<{ role: string; content: string }> {
	if (typeof compiled === "string") {
		return [{ role: "user", content: compiled }];
	}

	if (!Array.isArray(compiled)) {
		throw new Error("Judge prompt compilation returned unexpected shape");
	}

	const msgs: Array<{ role: string; content: string }> = [];

	for (const item of compiled) {
		if (
			typeof item === "object" &&
			item !== null &&
			"role" in item &&
			"content" in item
		) {
			const role = (item as { role: unknown }).role;
			const content = (item as { content: unknown }).content;
			if (typeof role === "string" && typeof content === "string") {
				msgs.push({ role, content });
				continue;
			}
		}

		// Unresolved placeholder or unexpected object — fail fast to avoid a bad judge call.
		throw new Error("Judge prompt contained unresolved placeholders");
	}

	return msgs;
}

export class AutoEvalService {
	private readonly judgeModel: ChatOpenAI;
	private readonly langfuse: LangfuseClient | null;

	constructor() {
		// Use LangChain (like ChartGeneratorService) to keep LLM usage consistent.
		this.judgeModel = new ChatOpenAI({
			openAIApiKey: config.openai.apiKey,
			modelName: config.autoEval.judgeModel,
			temperature: 0,
		});

		if (
			config.langfuse.enabled &&
			config.langfuse.publicKey &&
			config.langfuse.secretKey
		) {
			this.langfuse = new LangfuseClient({
				publicKey: config.langfuse.publicKey,
				secretKey: config.langfuse.secretKey,
				baseUrl: config.langfuse.host,
			});
		} else {
			this.langfuse = null;
		}
	}

	/**
	 * Runs an end-to-end evaluation (SQL + chart/VizSpec) using an LLM-as-judge.
	 *
	 * - Sampled and gated by config (`AUTO_EVAL_ENABLED`, `AUTO_EVAL_SAMPLE_RATE`).
	 * - Emits a dedicated Langfuse trace (`auto_eval_e2e`) and attaches scores to it.
	 * - Never sends raw query result rows; only schema/type info and chart specs.
	 */
	async evaluateE2E(input: AutoEvalE2EInput): Promise<void> {
		if (!config.autoEval.enabled) {
			logger.debug({ queryId: input.queryId }, "Auto-eval disabled; skipping");
			return;
		}
		if (!shouldSample(config.autoEval.sampleRate)) {
			logger.debug(
				{
					queryId: input.queryId,
					target: input.target,
					sampleRate: config.autoEval.sampleRate,
				},
				"Auto-eval skipped by sampling",
			);
			return;
		}

		const langfuse = this.langfuse;
		if (!langfuse) {
			logger.warn(
				{
					enabled: config.langfuse.enabled,
					hasKeys: !!(config.langfuse.publicKey && config.langfuse.secretKey),
				},
				"Auto-eval enabled but Langfuse client not configured; skipping",
			);
			return;
		}

		const judgeModel = config.autoEval.judgeModel;
		const promptVariables = buildJudgePromptVariables(input);

		logger.debug(
			{
				queryId: input.queryId,
				target: input.target,
				sessionId: input.sessionId,
				organizationId: input.organizationId,
			},
			"Starting auto-eval",
		);

		await startActiveObservation(
			"auto_eval_e2e",
			async (evaluator) => {
				evaluator.updateTrace({
					name: "auto_eval_e2e",
					userId: input.organizationId,
					sessionId: input.sessionId,
					tags: ["auto_eval", "e2e", input.target],
					metadata: {
						organization_id: input.organizationId,
						tenant_id: input.tenantId,
						query_id: input.queryId,
						dialect: input.dialect,
						target: input.target,
					},
				});

				const specInput =
					input.target === "chart"
						? { vegaLiteSpec: input.vegaLiteSpec ?? null }
						: { vizSpec: input.vizSpec ?? null };

				evaluator.update({
					input: {
						question: input.question,
						sql: input.sql,
						dialect: input.dialect,
						fields: input.fields,
						schema: input.schemaRows?.[0] ?? {},
						target: input.target,
						...specInput,
					},
				});

				const judgePrompt = await langfuse.prompt.get(JUDGE_PROMPT_NAME, {
					type: "chat",
					cacheTtlSeconds: 5 * 60,
					fetchTimeoutMs: config.autoEval.timeoutMs,
				});

				const judgeMessages = toChatMessages(
					judgePrompt.compile(promptVariables),
				);

				const judgeGeneration = evaluator.startObservation(
					"llm_as_judge",
					{
						model: judgeModel,
						modelParameters: {
							temperature: 0,
						},
						input: {
							messages: judgeMessages,
						},
						prompt: {
							name: judgePrompt.name,
							version: judgePrompt.version,
							isFallback: judgePrompt.isFallback,
						},
						metadata: {
							operation: "auto_eval_e2e_judge",
							target: input.target,
						},
					},
					{ asType: "generation" },
				);

				try {
					const controller = new AbortController();
					const timeoutMs = config.autoEval.timeoutMs;
					const timeout =
						typeof timeoutMs === "number"
							? setTimeout(() => controller.abort(), timeoutMs)
							: undefined;

					const response = await this.judgeModel.invoke(judgeMessages, {
						signal: controller.signal,
						runName: "LLM as judge",
						tags: ["auto_eval", "judge", input.target],
						metadata: {
							operation: "auto_eval_e2e_judge",
							target: input.target,
							query_id: input.queryId,
						},
					});

					if (timeout) clearTimeout(timeout);

					const rawContent =
						typeof response.content === "string"
							? response.content
							: JSON.stringify(response.content);

					const cleaned = rawContent
						.replace(/^```json\n?/i, "")
						.replace(/\n?```$/i, "")
						.trim();

					const parsed = judgeResultSchema.parse(
						JSON.parse(cleaned),
					) as JudgeResultParsed;

					judgeGeneration.update({
						output: {
							raw: rawContent,
							parsed,
						},
					});

					const normalized: JudgeResult = {
						scores: {
							e2e_answer_relevance: clamp01(parsed.scores.e2e_answer_relevance),
							sql_safety: clamp01(parsed.scores.sql_safety),
							viz_consistency: clamp01(parsed.scores.viz_consistency),
							viz_best_practice: clamp01(parsed.scores.viz_best_practice),
						},
						rationales: {
							e2e_answer_relevance: parsed.rationales.e2e_answer_relevance,
							sql_safety: parsed.rationales.sql_safety,
							viz_consistency: parsed.rationales.viz_consistency,
							viz_best_practice: parsed.rationales.viz_best_practice,
						},
					};

					evaluator.update({
						output: normalized,
					});

					logger.debug(
						{
							queryId: input.queryId,
							target: input.target,
							scores: normalized.scores,
						},
						"Auto-eval completed",
					);

					// Attach scores to the auto-eval trace (derived from the evaluator's OTel span).
					langfuse.score.trace(
						{ otelSpan: evaluator.otelSpan },
						{
							name: "e2e.answer_relevance",
							value: normalized.scores.e2e_answer_relevance,
							comment: normalized.rationales.e2e_answer_relevance,
							metadata: { query_id: input.queryId, target: input.target },
						},
					);

					langfuse.score.trace(
						{ otelSpan: evaluator.otelSpan },
						{
							name: "sql.safety",
							value: normalized.scores.sql_safety,
							comment: normalized.rationales.sql_safety,
							metadata: { query_id: input.queryId, target: input.target },
						},
					);

					langfuse.score.trace(
						{ otelSpan: evaluator.otelSpan },
						{
							name: "viz.consistency",
							value: normalized.scores.viz_consistency,
							comment: normalized.rationales.viz_consistency,
							metadata: { query_id: input.queryId, target: input.target },
						},
					);

					langfuse.score.trace(
						{ otelSpan: evaluator.otelSpan },
						{
							name: "viz.best_practice",
							value: normalized.scores.viz_best_practice,
							comment: normalized.rationales.viz_best_practice,
							metadata: { query_id: input.queryId, target: input.target },
						},
					);

					await langfuse.score.flush();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					evaluator.update({
						level: "ERROR",
						statusMessage: message,
						output: { error: message },
					});
					logger.warn({ error, queryId: input.queryId }, "Auto-eval failed");
				} finally {
					judgeGeneration.end();
				}
			},
			{ asType: "evaluator" },
		);
	}
}
