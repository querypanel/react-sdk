import { createLogger } from "../../lib/logger";
import { runPipeline, mergeTraces, type PipelineStep, type PipelineTrace } from "../../lib/pipeline";
import type { TelemetryContext } from "../../lib/telemetry";
import type {
	ContextChunk,
	GeneratedQuery,
	QueryRunResult,
	RetrievalResult,
} from "../../types/query";
import {
	SchemaStorageService,
	type TenantSettings,
	deriveTimeColumnsFromTableDefinitions,
} from "../schema-storage.service";
import type { GuardrailResult } from "../guardrail.service";
import { GuardrailError, GuardrailService } from "../guardrail.service";
import { ModerationService } from "../moderation.service";
import { QueryComplexityService } from "../query-complexity.service";
import type { Schema } from "../../types/schema";
import { SqlValidatorService } from "../sql-validator.service";
import { HybridRetrieverService } from "./hybrid-retriever.service";
import { classifyIntent, type IntentResult } from "./intent.service";
import { classifyModification } from "./modification-classifier.service";
import { SqlGeneratorV2Service } from "./sql-generator-v2.service";
import { linkSchema, applyPruning, type SchemaLinkingResult } from "./schema-linker.service";
import { reflectOnSql, applyReflection, type ReflectionResult } from "./sql-reflection.service";
import { verifyTenantIsolation, ensureTenantParam, validateDialectCompatibility } from "./tenant-verification.service";
import { deriveTimeColumnsFromChunks, mergeTimeColumns } from "./time-columns";

const logger = createLogger("v2:query-runner");

/**
 * The state object threaded through every pipeline step.
 * Each step enriches the state; the final step produces the QueryRunResult.
 */
export interface PipelineState {
	// ── Input (set once at the start) ────────────────────────────
	question: string;
	organizationId: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	database?: string;
	dialect?: string;
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	conversationHistory?: Array<{
		question: string;
		sql?: string | null;
		rationale?: string | null;
		created_at?: string | null;
		params?: Array<Record<string, unknown>> | null;
	}>;
	previousSql?: string;
	telemetry?: TelemetryContext;
	/** When set, overrides the configured SQL LLM model for this pipeline */
	sqlModelId?: string;
	timeColumns?: string[];

	// ── Enriched by pipeline steps ──────────────────────────────
	questionWithHistory?: string;
	schemaContext?: string;
	guard?: GuardrailResult;
	intent?: IntentResult;
	retrieval?: RetrievalResult;
	schemaLinking?: SchemaLinkingResult;
	prunedChunks?: ContextChunk[];
	generated?: GeneratedQuery;
	reflection?: ReflectionResult;
	validated?: boolean;
	result?: QueryRunResult;
}

export interface QueryRunV2Result extends QueryRunResult {
	/** Observable pipeline trace with per-step timings. */
	trace: PipelineTrace;
	/** Intent/plan produced by the planner step. */
	intent?: IntentResult;
	/** Which pipeline variant was used for this query. */
	modification_type?: string;
}

/**
 * V2 Query Runner — replaces the LangChain RunnableSequence with
 * a typed, observable pipeline built on the Vercel AI SDK.
 *
 * Full pipeline:
 *  1. Content moderation
 *  2. Schema overview retrieval (top 3 tables for guardrail + intent)
 *  3. Guardrail check
 *  4. Intent recognition + ambiguity detection
 *  5. Two-pass hybrid retrieval (table identification → targeted columns)
 *  6. Schema linking (entity → table.column mapping, pruning, join hints)
 *  7. Context pruning (drop unlinked chunks)
 *  8. Confidence-gated SQL generation:
 *     - High confidence (>0.9) + simple_lookup → single generation
 *     - Otherwise → multi-candidate generation (N=3, temp=0.3)
 *  9. SQL self-reflection (LLM reviews for semantic errors)
 * 10. Tenant isolation verification (deterministic regex check)
 * 11. Regex validation + complexity analysis
 * 12. Build result
 */
export class QueryRunnerV2Service {
	private readonly hybridRetriever: HybridRetrieverService;
	private readonly schemaStorage: SchemaStorageService;

	constructor(
		private readonly moderation = new ModerationService(),
		private readonly guardrail = new GuardrailService(),
		schemaStorage = new SchemaStorageService(),
		private readonly generator = new SqlGeneratorV2Service(),
		private readonly validator = new SqlValidatorService(),
		private readonly complexity = new QueryComplexityService(),
	) {
		this.schemaStorage = schemaStorage;
		this.hybridRetriever = new HybridRetrieverService(schemaStorage);
	}

	private finalizeGeneratedQuery(
		generated: GeneratedQuery,
		tenantId?: string,
		tenantSettings?: TenantSettings,
	): GeneratedQuery {
		const completed = ensureTenantParam(generated, tenantId, tenantSettings);
		try {
			validateDialectCompatibility(completed);
			verifyTenantIsolation(
				completed.sql,
				tenantId,
				tenantSettings,
				completed.dialect,
			);
		} catch (error) {
			(error as Error & { __failedSql?: string }).__failedSql = completed.sql;
			throw error;
		}
		return completed;
	}

	// ── Public API ───────────────────────────────────────────────

	async run(
		question: string,
		organizationId: string,
		tenantId?: string,
		lastError?: string,
		previousSql?: string,
		tenantSettings?: TenantSettings,
		database?: string,
		dialect?: string,
		systemPrompt?: string,
		conversationHistory?: PipelineState["conversationHistory"],
		telemetry?: TelemetryContext,
		maxRetry = 3,
		sqlModelId?: string,
	): Promise<QueryRunV2Result> {
		// Existing: repair path
		if (lastError && previousSql) {
			return this.runRepair(
				question,
				organizationId,
				tenantId,
				previousSql,
				lastError,
				tenantSettings,
				conversationHistory,
				database,
				dialect,
				systemPrompt,
				telemetry,
				sqlModelId,
			);
		}

		// Follow-up detection: if conversation history has a previous turn with SQL, classify
		const lastTurnWithSql = conversationHistory?.findLast((t) => t.sql);
		if (lastTurnWithSql?.sql) {
			const classification = await classifyModification({
				question,
				previousSql: lastTurnWithSql.sql,
				previousQuestion: lastTurnWithSql.question,
				conversationHistory,
				telemetry,
			});

			logger.info(
				{
					classificationType: classification.type,
					confidence: classification.confidence,
					instruction: classification.instruction,
				},
				"Modification classified for follow-up query",
			);

			if (classification.type !== "full_query") {
				switch (classification.type) {
					case "date_filter": {
						const schemaRow = await this.schemaStorage.getLatestSchema(organizationId, database);
						const timeColumns =
							schemaRow?.config?.timeColumns ??
							deriveTimeColumnsFromSchemaSnapshot(schemaRow?.schema);
						const result = await this.runDateFilterRewrite({
							previousSql: lastTurnWithSql.sql,
							previousParams: lastTurnWithSql.params ?? [],
							dateRange: classification.date_range ?? {},
							question,
							tenantId,
							tenantSettings,
							database,
							dialect,
							systemPrompt,
							conversationHistory,
							timeColumns,
							modelId: sqlModelId,
						});
						return { ...result, modification_type: "date_filter" };
					}
					case "sql_modify_light": {
						const result = await this.runModifyLight({
							previousSql: lastTurnWithSql.sql,
							previousParams: lastTurnWithSql.params ?? [],
							instruction: classification.instruction,
							question,
							organizationId,
							tenantId,
							tenantSettings,
							database,
							dialect,
							systemPrompt,
							conversationHistory,
							sqlModelId,
						});
						return { ...result, modification_type: "sql_modify_light" };
					}
					case "sql_modify_full": {
						const result = await this.runModifyFull({
							previousSql: lastTurnWithSql.sql,
							previousParams: lastTurnWithSql.params ?? [],
							instruction: classification.instruction,
							question,
							organizationId,
							tenantId,
							tenantSettings,
							database,
							dialect,
							systemPrompt,
							conversationHistory,
							sqlModelId,
						});
						return { ...result, modification_type: "sql_modify_full" };
					}
				}
			}
			// full_query or low confidence → fall through to full pipeline
		}

		// Full pipeline
		const schemaRow = await this.schemaStorage.getLatestSchema(organizationId, database);
		const configTimeColumns = schemaRow?.config?.timeColumns;
		const snapshotTimeColumns = deriveTimeColumnsFromSchemaSnapshot(schemaRow?.schema);
		const timeColumns = schemaRow?.config?.timeColumns ?? snapshotTimeColumns;

		console.log(
			"[v2-debug] timeColumns: initial (from table_schemas, before retrieval merge)",
			JSON.stringify(
				{
					organizationId,
					database,
					hasSchemaRow: Boolean(schemaRow),
					configTimeColumns: configTimeColumns ?? null,
					derivedFromSchemaSnapshot: snapshotTimeColumns,
					resolvedInitialTimeColumns: timeColumns ?? null,
					availableDateTimeBlockWillBeIncluded:
						Array.isArray(timeColumns) && timeColumns.length > 0,
				},
				null,
				2,
			),
		);

		const initialState: PipelineState = {
			question,
			organizationId,
			tenantId,
			tenantSettings,
			database,
			dialect,
			systemPrompt,
			conversationHistory,
			previousSql,
			telemetry,
			sqlModelId,
			timeColumns,
		};

		// Phase 1: preparation (runs once)
		const prepSteps = this.buildPreparationSteps();
		const { state: prepState, trace: prepTrace } = await runPipeline(prepSteps, initialState);

		// Phase 2: generation (retried on validation failure)
		let retryContext: { failedSql: string; error: string } | undefined;
		for (let attempt = 0; attempt <= maxRetry; attempt++) {
			try {
				const genSteps = this.buildGenerationSteps(retryContext);
				const { state, trace: genTrace } = await runPipeline(genSteps, prepState);
				const trace = mergeTraces(prepTrace, genTrace);

				return {
					...state.result!,
					trace,
					intent: state.intent,
					modification_type: lastTurnWithSql ? "full_query" : undefined,
				};
			} catch (err: any) {
				if (err.__failedSql && attempt < maxRetry) {
					logger.warn(
						{ attempt: attempt + 1, maxRetry, failedSql: err.__failedSql, error: err.message },
						"SQL validation failed, retrying generation",
					);
					retryContext = { failedSql: err.__failedSql, error: err.message };
					continue;
				}
				// Attach merged trace to the error for the route handler
				if (err.__pipelineTrace) {
					err.__pipelineTrace = mergeTraces(prepTrace, err.__pipelineTrace);
				}
				throw err;
			}
		}

		// Unreachable, but TypeScript needs it
		throw new Error("Retry loop exhausted");
	}

	async runDateFilterRewrite(input: {
		previousSql: string;
		previousParams: Array<Record<string, unknown>>;
		dateRange: { from?: string; to?: string };
		question: string;
		tenantId?: string;
		tenantSettings?: TenantSettings;
		database?: string;
		dialect?: string;
		systemPrompt?: string;
		conversationHistory?: PipelineState["conversationHistory"];
		timeColumns?: string[];
		telemetry?: TelemetryContext;
		modelId?: string;
	}): Promise<QueryRunV2Result> {
		const previousRationale = getPreviousRationale(
			input.conversationHistory,
			input.previousSql,
		);
		const initialState: PipelineState = {
			question: input.question,
			organizationId: "",
			tenantId: input.tenantId,
			tenantSettings: input.tenantSettings,
			database: input.database,
			dialect: input.dialect,
			telemetry: input.telemetry,
		};

		const steps: PipelineStep<PipelineState>[] = [
			{
				name: "sql_date_rewrite",
				run: async (s) => {
					const generated = await this.generator.rewriteDateFilter({
						previousSql: input.previousSql,
						previousParams: input.previousParams,
						previousRationale,
						dateRange: input.dateRange,
						question: input.question,
						dialect: input.dialect,
						tenantId: input.tenantId,
						tenantSettings: input.tenantSettings,
						timeColumns: input.timeColumns,
						systemPrompt: input.systemPrompt,
						telemetry: s.telemetry,
						modelId: input.modelId,
					});
					return { ...s, generated };
				},
			},
			{
				name: "tenant_verification",
				run: async (s) => {
					const generated = this.finalizeGeneratedQuery(
						s.generated!,
						s.tenantId,
						s.tenantSettings,
					);
					return { ...s, generated };
				},
			},
			{
				name: "ensure_limit",
				run: async (s) => {
					const sql = this.validator.ensureLimit(s.generated!.sql);
					return sql !== s.generated!.sql
						? { ...s, generated: { ...s.generated!, sql } }
						: s;
				},
			},
			{
				name: "sql_validation",
				run: async (s) => {
					this.validator.validate(s.generated!.sql);
					return { ...s, validated: true };
				},
			},
			{
				name: "build_result",
				run: async (s) => {
					const result: QueryRunResult = {
						...s.generated!,
						context: [],
						database: input.database,
					};
					return { ...s, result };
				},
			},
		];

		const { state, trace } = await runPipeline(steps, initialState);

		return {
			...state.result!,
			trace,
		};
	}

	// ── Modify Light pipeline (1-2 LLM calls) ──────────────────

	private async runModifyLight(input: {
		previousSql: string;
		previousParams: Array<Record<string, unknown>>;
		instruction: string;
		question: string;
		organizationId: string;
		tenantId?: string;
		tenantSettings?: TenantSettings;
		database?: string;
		dialect?: string;
		systemPrompt?: string;
		conversationHistory?: PipelineState["conversationHistory"];
		sqlModelId?: string;
	}): Promise<QueryRunV2Result> {
		const previousRationale = getPreviousRationale(
			input.conversationHistory,
			input.previousSql,
		);
		const initialState: PipelineState = {
			question: input.question,
			organizationId: input.organizationId,
			tenantId: input.tenantId,
			tenantSettings: input.tenantSettings,
			database: input.database,
			dialect: input.dialect,
			systemPrompt: input.systemPrompt,
		};

		const steps: PipelineStep<PipelineState>[] = [
			{
				name: "sql_modify",
				run: async (s) => {
					const generated = await this.generator.modifySql({
						previousSql: input.previousSql,
						previousParams: input.previousParams,
						previousRationale,
						instruction: input.instruction,
						question: input.question,
						dialect: input.dialect,
						tenantId: input.tenantId,
						tenantSettings: input.tenantSettings,
						systemPrompt: input.systemPrompt,
						modelId: input.sqlModelId,
					});
					return { ...s, generated };
				},
			},
			{
				name: "sql_reflection",
				run: async (s) => {
					const reflection = await reflectOnSql({
						question: input.question,
						sql: s.generated!.sql,
						params: s.generated!.params,
						rationale: s.generated!.rationale,
						contextChunks: [],
						dialect: input.dialect,
						tenantFieldName: input.tenantSettings?.tenantFieldName,
						enforceTenantIsolation: input.tenantSettings?.enforceTenantIsolation,
						systemPrompt: input.systemPrompt,
						timeColumns: s.timeColumns,
					});
					const generated = applyReflection(s.generated!, reflection);
					return { ...s, reflection, generated };
				},
			},
			{
				name: "tenant_verification",
				run: async (s) => {
					const generated = this.finalizeGeneratedQuery(
						s.generated!,
						s.tenantId,
						s.tenantSettings,
					);
					return { ...s, generated };
				},
			},
			{
				name: "ensure_limit",
				run: async (s) => {
					const sql = this.validator.ensureLimit(s.generated!.sql);
					return sql !== s.generated!.sql
						? { ...s, generated: { ...s.generated!, sql } }
						: s;
				},
			},
			{
				name: "sql_validation",
				run: async (s) => {
					this.validator.validate(s.generated!.sql);
					return { ...s, validated: true };
				},
			},
			{
				name: "build_result",
				run: async (s) => {
					const result: QueryRunResult = {
						...s.generated!,
						context: [],
						database: input.database,
					};
					return { ...s, result };
				},
			},
		];

		const { state, trace } = await runPipeline(steps, initialState);

		return {
			...state.result!,
			trace,
		};
	}

	// ── Modify Full pipeline (3-4 LLM calls) ───────────────────

	private async runModifyFull(input: {
		previousSql: string;
		previousParams: Array<Record<string, unknown>>;
		instruction: string;
		question: string;
		organizationId: string;
		tenantId?: string;
		tenantSettings?: TenantSettings;
		database?: string;
		dialect?: string;
		systemPrompt?: string;
		conversationHistory?: PipelineState["conversationHistory"];
		sqlModelId?: string;
	}): Promise<QueryRunV2Result> {
		const previousRationale = getPreviousRationale(
			input.conversationHistory,
			input.previousSql,
		);
		const initialState: PipelineState = {
			question: input.question,
			organizationId: input.organizationId,
			tenantId: input.tenantId,
			tenantSettings: input.tenantSettings,
			database: input.database,
			dialect: input.dialect,
			systemPrompt: input.systemPrompt,
			conversationHistory: input.conversationHistory,
		};

		const steps: PipelineStep<PipelineState>[] = [
			{
				name: "two_pass_retrieval",
				run: async (s) => {
					const retrieval = await this.hybridRetriever.retrieveTwoPass(
						s.question,
						s.organizationId,
						s.database,
						s.dialect,
					);
					logger.debug(
						{
							chunksCount: retrieval.chunks.length,
							dialect: retrieval.dialect,
							primaryTable: retrieval.primaryTable,
						},
						"Two-pass retrieval for modify_full",
					);
					return { ...s, retrieval };
				},
			},
			{
				name: "schema_linking",
				run: async (s) => {
					const schemaLinking = await linkSchema({
						question: s.question,
						contextChunks: s.retrieval!.chunks,
					});
					return { ...s, schemaLinking };
				},
			},
			{
				name: "context_pruning",
				run: async (s) => {
					const prunedChunks = applyPruning(
						s.retrieval!.chunks,
						s.schemaLinking!,
					);
					const derivedTimeColumns = deriveTimeColumnsFromChunks(prunedChunks);
					const timeColumns = mergeTimeColumns(
						s.timeColumns,
						derivedTimeColumns,
					);
					logger.debug(
						{
							explicitTimeColumns: s.timeColumns,
							derivedTimeColumns,
							mergedTimeColumns: timeColumns,
						},
						"Resolved available time columns",
					);
					return { ...s, prunedChunks, timeColumns };
				},
			},
			{
				name: "sql_modify",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const chunks = s.prunedChunks ?? s.retrieval!.chunks;
					const generated = await this.generator.modifySql({
						previousSql: input.previousSql,
						previousParams: input.previousParams,
						previousRationale,
						instruction: input.instruction,
						question: input.question,
						dialect: s.retrieval!.dialect,
						tenantId: s.tenantId,
						tenantSettings,
						contextChunks: chunks,
						joinHints: s.schemaLinking?.joinHints ?? undefined,
						timeColumns: s.timeColumns,
						systemPrompt: input.systemPrompt,
						modelId: input.sqlModelId,
					});
					return { ...s, generated, tenantSettings };
				},
			},
			{
				name: "sql_reflection",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const chunks = s.prunedChunks ?? s.retrieval!.chunks;
					const reflection = await reflectOnSql({
						question: input.question,
						sql: s.generated!.sql,
						params: s.generated!.params,
						rationale: s.generated!.rationale,
						contextChunks: chunks,
						schemaLinking: s.schemaLinking,
						dialect: s.retrieval!.dialect,
						tenantFieldName: tenantSettings?.tenantFieldName,
						enforceTenantIsolation: tenantSettings?.enforceTenantIsolation,
						systemPrompt: input.systemPrompt,
						timeColumns: s.timeColumns,
					});
					const generated = applyReflection(s.generated!, reflection);
					return { ...s, reflection, generated };
				},
			},
			{
				name: "tenant_verification",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const generated = this.finalizeGeneratedQuery(
						s.generated!,
						s.tenantId,
						tenantSettings,
					);
					return { ...s, generated };
				},
			},
			{
				name: "ensure_limit",
				run: async (s) => {
					const sql = this.validator.ensureLimit(s.generated!.sql);
					return sql !== s.generated!.sql
						? { ...s, generated: { ...s.generated!, sql } }
						: s;
				},
			},
			{
				name: "sql_validation",
				run: async (s) => {
					this.validator.validate(s.generated!.sql);
					const complexityAnalysis = this.complexity.analyze(
						s.generated!.sql,
						s.prunedChunks ?? s.retrieval!.chunks,
					);
					if (complexityAnalysis.warnings.length > 0) {
						logger.warn(
							{
								sql: s.generated!.sql,
								warnings: complexityAnalysis.warnings,
							},
							"Modified query has complexity warnings",
						);
					}
					return { ...s, validated: true };
				},
			},
			{
				name: "build_result",
				run: async (s) => {
					const result: QueryRunResult = {
						...s.generated!,
						context: s.prunedChunks ?? s.retrieval!.chunks,
						database: s.retrieval!.database,
						table: s.retrieval!.primaryTable,
					};
					return { ...s, result };
				},
			},
		];

		const { state, trace } = await runPipeline(steps, initialState);

		return {
			...state.result!,
			trace,
		};
	}

	// ── Pipeline step definitions ────────────────────────────────

	/**
	 * Preparation steps: content_moderation through context_pruning.
	 * These run once and produce the enriched state for generation.
	 */
	private buildPreparationSteps(): PipelineStep<PipelineState>[] {
		return [
			{
				name: "content_moderation",
				run: async (s) => {
					const questionWithHistory = buildQuestionWithHistory(
						s.question,
						s.conversationHistory,
					);
					await this.moderation.moderationChain.invoke({
						question: questionWithHistory,
						organizationId: s.organizationId,
						tenantId: s.tenantId,
					});
					return { ...s, questionWithHistory };
				},
			},
			{
				name: "schema_overview_retrieval",
				run: async (s) => {
					const schemaContext = await this.hybridRetriever.retrieveTableOverview(
						s.question,
						s.organizationId,
						s.database,
						s.dialect,
					);
					return { ...s, schemaContext };
				},
			},
			{
				name: "guardrail_check",
				run: async (s) => {
					const guard = await this.guardrail.enforce(
						s.questionWithHistory ?? s.question,
						s.schemaContext,
					);
					if (!guard.allowed) {
						throw new GuardrailError(
							guard.reason ?? "Question rejected",
							guard.threat_type,
						);
					}
					return { ...s, guard };
				},
			},
			{
				name: "intent_recognition",
				run: async (s) => {
					const intent = await classifyIntent({
						question: s.question,
						schemaContext: s.schemaContext,
						conversationHistory: s.conversationHistory,
						telemetry: s.telemetry,
					});

					// If clarification is needed, short-circuit the pipeline
					if (intent.intent === "clarification_needed") {
						const clarificationMessage = [
							"Your question needs clarification before I can generate SQL.",
							...intent.ambiguities.map(
								(a) => `- ${a.issue}: ${a.suggestion}`,
							),
						].join("\n");
						throw new ClarificationNeededError(
							clarificationMessage,
							intent.ambiguities,
						);
					}

					return { ...s, intent };
				},
			},
			{
				name: "two_pass_retrieval",
				run: async (s) => {
					const searchQuestion =
						s.intent?.rewrittenQuestion ?? s.question;
					const retrieval = await this.hybridRetriever.retrieveTwoPass(
						searchQuestion,
						s.organizationId,
						s.database,
						s.dialect,
					);
					logger.debug(
						{
							chunksCount: retrieval.chunks.length,
							dialect: retrieval.dialect,
							primaryTable: retrieval.primaryTable,
						},
						"Two-pass hybrid context retrieved",
					);
					return { ...s, retrieval };
				},
			},
			{
				name: "schema_linking",
				run: async (s) => {
					const schemaLinking = await linkSchema({
						question: s.intent?.rewrittenQuestion ?? s.question,
						contextChunks: s.retrieval!.chunks,
						intentTables: s.intent?.plan.tables,
						intentOperations: s.intent?.plan.operations,
						telemetry: s.telemetry,
					});
					return { ...s, schemaLinking };
				},
			},
			{
				name: "context_pruning",
				run: async (s) => {
					logger.debug(
						{
							inputChunks: s.retrieval!.chunks.map((c) => ({
								source: c.source,
								table: c.metadata.table ?? null,
								column: c.metadata.column ?? null,
								score: c.score,
								id: (c.metadata.target_identifier as string) ?? null,
							})),
						},
						"Context pruning input (pre-prune chunks)",
					);
					const prunedChunks = applyPruning(
						s.retrieval!.chunks,
						s.schemaLinking!,
					);
					const derivedFromChunks = deriveTimeColumnsFromChunks(prunedChunks);
					const timeColumns = mergeTimeColumns(
						s.timeColumns,
						derivedFromChunks,
					);
					logger.debug(
						{
							originalCount: s.retrieval!.chunks.length,
							prunedCount: prunedChunks.length,
							removedCount: s.retrieval!.chunks.length - prunedChunks.length,
							survivingChunks: prunedChunks.map((c) => ({
								source: c.source,
								table: c.metadata.table ?? null,
								column: c.metadata.column ?? null,
								id: (c.metadata.target_identifier as string) ?? null,
							})),
						},
						"Context pruned via schema linking",
					);
					console.log(
						"[v2-debug] timeColumns: after context_pruning (main prep pipeline)",
						JSON.stringify(
							{
								explicitBeforeMerge: s.timeColumns ?? null,
								derivedFromPrunedChunks: derivedFromChunks,
								mergedTimeColumns: timeColumns ?? null,
								mergeRule:
									s.timeColumns && s.timeColumns.length > 0
										? "explicit wins (retrieval-derived ignored)"
										: "using retrieval-derived or empty",
								availableDateTimeBlockWillBeIncluded:
									Array.isArray(timeColumns) && timeColumns.length > 0,
							},
							null,
							2,
						),
					);
					return { ...s, prunedChunks, timeColumns };
				},
			},
		];
	}

	/**
	 * Generation steps: sql_generation through build_result.
	 * On retry, uses repair() instead of generate/generateMultiple.
	 */
	private buildGenerationSteps(
		retryContext?: { failedSql: string; error: string },
	): PipelineStep<PipelineState>[] {
		return [
			{
				name: retryContext ? "sql_repair" : "sql_generation",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const chunks = s.prunedChunks ?? s.retrieval!.chunks;

					let generated: GeneratedQuery;

					if (retryContext) {
						logger.debug(
							{ failedSql: retryContext.failedSql, error: retryContext.error },
							"Using repair generator for retry",
						);
						generated = await this.generator.repair({
							question: s.intent?.rewrittenQuestion ?? s.question,
							originalQuestion: s.question,
							contextChunks: chunks,
							dialect: s.retrieval!.dialect,
							primaryTable: s.retrieval!.primaryTable,
							previousSql: retryContext.failedSql,
							error: retryContext.error,
							tenantId: s.tenantId,
							tenantSettings,
							conversationHistory: s.conversationHistory,
							intent: s.intent,
							timeColumns: s.timeColumns,
							systemPrompt: s.systemPrompt,
							telemetry: s.telemetry,
							modelId: s.sqlModelId,
						});
					} else {
						const generatorInput = {
							question: s.intent?.rewrittenQuestion ?? s.question,
							originalQuestion: s.question,
							contextChunks: chunks,
							dialect: s.retrieval!.dialect,
							primaryTable: s.retrieval!.primaryTable,
							tenantId: s.tenantId,
							tenantSettings,
							conversationHistory: s.conversationHistory,
							intent: s.intent,
							joinHints: s.schemaLinking?.joinHints ?? undefined,
							previousSql: s.previousSql,
							systemPrompt: s.systemPrompt,
							timeColumns: s.timeColumns,
							telemetry: s.telemetry,
							modelId: s.sqlModelId,
						};

						console.log(
							"[v2-debug] timeColumns: passed into SqlGeneratorV2 (generate / generateMultiple)",
							JSON.stringify(
								{
									timeColumns: generatorInput.timeColumns ?? null,
									chunkCount: chunks.length,
								},
								null,
								2,
							),
						);

						// Confidence-gated generation:
						// High confidence + simple lookup → single generation (fast)
						// Otherwise → multi-candidate with self-consistency (accurate)
						const isSimpleHighConfidence =
							s.intent?.confidence !== undefined &&
							s.intent.confidence > 0.9 &&
							s.intent.intent === "simple_lookup";

						if (isSimpleHighConfidence) {
							logger.debug("Using single-candidate generation (high confidence simple_lookup)");
							generated = await this.generator.generate(generatorInput);
						} else {
							logger.debug(
								{
									confidence: s.intent?.confidence,
									intent: s.intent?.intent,
								},
								"Using multi-candidate generation",
							);
							generated = await this.generator.generateMultiple(generatorInput, 3);
						}
					}

					return { ...s, generated, tenantSettings };
				},
			},
			{
				name: "sql_reflection",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const chunks = s.prunedChunks ?? s.retrieval!.chunks;

					const reflection = await reflectOnSql({
						question: s.intent?.rewrittenQuestion ?? s.question,
						originalQuestion: s.question,
						sql: s.generated!.sql,
						params: s.generated!.params,
						rationale: s.generated!.rationale,
						contextChunks: chunks,
						schemaLinking: s.schemaLinking,
						dialect: s.retrieval!.dialect,
						tenantFieldName: tenantSettings?.tenantFieldName,
						enforceTenantIsolation: tenantSettings?.enforceTenantIsolation,
						timeColumns: s.timeColumns,
						systemPrompt: s.systemPrompt,
						telemetry: s.telemetry,
					});

					const generated = applyReflection(s.generated!, reflection);

					return { ...s, reflection, generated };
				},
			},
			{
				name: "tenant_verification",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const generated = this.finalizeGeneratedQuery(
						s.generated!,
						s.tenantId,
						tenantSettings,
					);
					return { ...s, generated };
				},
			},
			{
				name: "ensure_limit",
				run: async (s) => {
					const sql = this.validator.ensureLimit(s.generated!.sql);
					return sql !== s.generated!.sql
						? { ...s, generated: { ...s.generated!, sql } }
						: s;
				},
			},
			{
				name: "sql_validation",
				run: async (s) => {
					const sql = s.generated!.sql;
					logger.debug({ sql }, "Validating SQL");
					try {
						this.validator.validate(sql);
					} catch (err: any) {
						err.__failedSql = sql;
						throw err;
					}

					const complexityAnalysis = this.complexity.analyze(
						sql,
						s.retrieval!.chunks,
					);
					if (complexityAnalysis.warnings.length > 0) {
						logger.warn(
							{
								sql,
								warnings: complexityAnalysis.warnings,
								riskLevel: complexityAnalysis.riskLevel,
							},
							"Query has complexity warnings",
						);
					}

					return { ...s, validated: true };
				},
			},
			{
				name: "build_result",
				run: async (s) => {
					const result: QueryRunResult = {
						...s.generated!,
						context: s.prunedChunks ?? s.retrieval!.chunks,
						guardrail_notes: s.guard?.reason,
						database: s.retrieval!.database,
						table: s.retrieval!.primaryTable,
					};
					return { ...s, result };
				},
			},
		];
	}

	// ── Repair pipeline ──────────────────────────────────────────

	private async runRepair(
		question: string,
		organizationId: string,
		tenantId: string | undefined,
		previousSql: string,
		error: string,
		tenantSettings?: TenantSettings,
		conversationHistory?: PipelineState["conversationHistory"],
		database?: string,
		dialect?: string,
		systemPrompt?: string,
		telemetry?: TelemetryContext,
		sqlModelId?: string,
	): Promise<QueryRunV2Result> {
		const initialState: PipelineState = {
			question,
			organizationId,
			tenantId,
			tenantSettings,
			database,
			dialect,
			systemPrompt,
			conversationHistory,
			telemetry,
			sqlModelId,
		};

		const steps: PipelineStep<PipelineState>[] = [
			{
				name: "content_moderation",
				run: async (s) => {
					const questionWithHistory = buildQuestionWithHistory(
						s.question,
						s.conversationHistory,
					);
					await this.moderation.moderationChain.invoke({
						question: questionWithHistory,
						organizationId: s.organizationId,
						tenantId: s.tenantId,
					});
					return { ...s, questionWithHistory };
				},
			},
			{
				name: "schema_overview_retrieval",
				run: async (s) => {
					const schemaContext = await this.hybridRetriever.retrieveTableOverview(
						s.question,
						s.organizationId,
						s.database,
						s.dialect,
					);
					return { ...s, schemaContext };
				},
			},
			{
				name: "guardrail_check",
				run: async (s) => {
					const guard = await this.guardrail.enforce(
						s.questionWithHistory ?? s.question,
						s.schemaContext,
					);
					if (!guard.allowed) {
						throw new GuardrailError(
							guard.reason ?? "Question rejected",
							guard.threat_type,
						);
					}
					return { ...s, guard };
				},
			},
			{
				name: "intent_recognition",
				run: async (s) => {
					const intent = await classifyIntent({
						question: s.question,
						schemaContext: s.schemaContext,
						conversationHistory: s.conversationHistory,
						telemetry: s.telemetry,
					});

					if (intent.intent === "clarification_needed") {
						const clarificationMessage = [
							"Your question needs clarification before I can generate SQL.",
							...intent.ambiguities.map(
								(a) => `- ${a.issue}: ${a.suggestion}`,
							),
						].join("\n");
						throw new ClarificationNeededError(
							clarificationMessage,
							intent.ambiguities,
						);
					}

					return { ...s, intent };
				},
			},
			{
				name: "two_pass_retrieval",
				run: async (s) => {
					const searchQuestion =
						s.intent?.rewrittenQuestion ?? s.question;
					const retrieval = await this.hybridRetriever.retrieveTwoPass(
						searchQuestion,
						s.organizationId,
						s.database,
						s.dialect,
					);
					return { ...s, retrieval };
				},
			},
			{
				name: "schema_linking",
				run: async (s) => {
					const schemaLinking = await linkSchema({
						question: s.intent?.rewrittenQuestion ?? s.question,
						contextChunks: s.retrieval!.chunks,
						intentTables: s.intent?.plan.tables,
						intentOperations: s.intent?.plan.operations,
						telemetry: s.telemetry,
					});
					return { ...s, schemaLinking };
				},
			},
			{
				name: "context_pruning",
				run: async (s) => {
					const prunedChunks = applyPruning(
						s.retrieval!.chunks,
						s.schemaLinking!,
					);
					const derivedFromChunks = deriveTimeColumnsFromChunks(prunedChunks);
					const timeColumns = mergeTimeColumns(
						s.timeColumns,
						derivedFromChunks,
					);
					console.log(
						"[v2-debug] timeColumns: after context_pruning (repair pipeline)",
						JSON.stringify(
							{
								explicitBeforeMerge: s.timeColumns ?? null,
								derivedFromPrunedChunks: derivedFromChunks,
								mergedTimeColumns: timeColumns ?? null,
								mergeRule:
									s.timeColumns && s.timeColumns.length > 0
										? "explicit wins (retrieval-derived ignored)"
										: "using retrieval-derived or empty",
								availableDateTimeBlockWillBeIncluded:
									Array.isArray(timeColumns) && timeColumns.length > 0,
							},
							null,
							2,
						),
					);
					return { ...s, prunedChunks, timeColumns };
				},
			},
			{
				name: "sql_repair",
				run: async (s) => {
					const repairQuestion = s.intent?.rewrittenQuestion ?? s.question;
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const generated = await this.generator.repair({
						question: repairQuestion,
						originalQuestion: s.question,
						contextChunks: s.prunedChunks ?? s.retrieval!.chunks,
						dialect: s.retrieval!.dialect,
						primaryTable: s.retrieval!.primaryTable,
						previousSql,
						error,
						tenantId: s.tenantId,
						tenantSettings,
						conversationHistory: s.conversationHistory,
						intent: s.intent,
						timeColumns: s.timeColumns,
						systemPrompt: s.systemPrompt,
						telemetry: s.telemetry,
						modelId: s.sqlModelId,
					});
					return { ...s, generated, tenantSettings };
				},
			},
			{
				name: "sql_reflection",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const chunks = s.prunedChunks ?? s.retrieval!.chunks;

					const reflection = await reflectOnSql({
						question: s.intent?.rewrittenQuestion ?? s.question,
						originalQuestion: s.question,
						sql: s.generated!.sql,
						params: s.generated!.params,
						rationale: s.generated!.rationale,
						contextChunks: chunks,
						schemaLinking: s.schemaLinking,
						dialect: s.retrieval!.dialect,
						tenantFieldName: tenantSettings?.tenantFieldName,
						enforceTenantIsolation: tenantSettings?.enforceTenantIsolation,
						systemPrompt: s.systemPrompt,
						timeColumns: s.timeColumns,
						telemetry: s.telemetry,
					});

					const generated = applyReflection(s.generated!, reflection);

					return { ...s, reflection, generated };
				},
			},
			{
				name: "tenant_verification",
				run: async (s) => {
					const tenantSettings =
						s.tenantSettings ?? s.retrieval!.tenantSettings;
					const generated = this.finalizeGeneratedQuery(
						s.generated!,
						s.tenantId,
						tenantSettings,
					);
					return { ...s, generated };
				},
			},
			{
				name: "ensure_limit",
				run: async (s) => {
					const sql = this.validator.ensureLimit(s.generated!.sql);
					return sql !== s.generated!.sql
						? { ...s, generated: { ...s.generated!, sql } }
						: s;
				},
			},
			{
				name: "sql_validation",
				run: async (s) => {
					this.validator.validate(s.generated!.sql);
					const complexityAnalysis = this.complexity.analyze(
						s.generated!.sql,
						s.prunedChunks ?? s.retrieval!.chunks,
					);
					if (complexityAnalysis.warnings.length > 0) {
						logger.warn(
							{
								sql: s.generated!.sql,
								warnings: complexityAnalysis.warnings,
							},
							"Repaired query has complexity warnings",
						);
					}
					return { ...s, validated: true };
				},
			},
			{
				name: "build_result",
				run: async (s) => {
					const result: QueryRunResult = {
						...s.generated!,
						context: s.prunedChunks ?? s.retrieval!.chunks,
						guardrail_notes: s.guard?.reason,
						database: s.retrieval!.database,
						table: s.retrieval!.primaryTable,
					};
					return { ...s, result };
				},
			},
		];

		const { state, trace } = await runPipeline(steps, initialState);

		return {
			...state.result!,
			trace,
			intent: state.intent,
		};
	}
}

// ── Errors ──────────────────────────────────────────────────────

export class ClarificationNeededError extends Error {
	constructor(
		message: string,
		public readonly ambiguities: Array<{
			issue: string;
			suggestion: string;
		}>,
	) {
		super(message);
		this.name = "ClarificationNeededError";
	}
}

// ── Helpers ─────────────────────────────────────────────────────

function buildQuestionWithHistory(
	question: string,
	conversationHistory?: PipelineState["conversationHistory"],
): string {
	if (!conversationHistory?.length) return question;

	const recentTurns = conversationHistory.slice(-3);
	const historyBlock = recentTurns
		.map((turn, index) => {
			const parts = [`Turn ${index + 1} - Question: ${turn.question}`];
			if (turn.rationale) parts.push(`Rationale: ${turn.rationale}`);
			if (turn.sql) parts.push(`SQL: ${turn.sql}`);
			return parts.join("\n");
		})
		.join("\n\n");

	return `Conversation history:\n${historyBlock}\n\nCurrent question: ${question}`;
}

function getPreviousRationale(
	conversationHistory?: PipelineState["conversationHistory"],
	previousSql?: string,
): string | undefined {
	if (!conversationHistory?.length) return undefined;

	if (previousSql) {
		const matchingTurn = [...conversationHistory]
			.reverse()
			.find((turn) => turn.sql === previousSql && turn.rationale);
		if (matchingTurn?.rationale) return matchingTurn.rationale;
	}

	const lastTurnWithSql = [...conversationHistory]
		.reverse()
		.find((turn) => turn.sql && turn.rationale);
	return lastTurnWithSql?.rationale ?? undefined;
}

function deriveTimeColumnsFromSchemaSnapshot(schema: unknown): string[] {
	if (!schema || typeof schema !== "object") return [];
	const tables = (schema as { tables?: unknown }).tables;
	if (!Array.isArray(tables)) return [];
	return deriveTimeColumnsFromTableDefinitions(tables as Schema["tables"]);
}
