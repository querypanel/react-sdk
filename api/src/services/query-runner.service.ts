import {
	RunnableBranch,
	RunnableLambda,
	RunnablePassthrough,
	RunnableSequence,
} from "@langchain/core/runnables";
import type { CallbackHandler } from "@langfuse/langchain";
import { createLogger } from "../lib/logger";
import type {
	GeneratedQuery,
	QueryRunResult,
	RetrievalResult,
} from "../types/query";
import type { GuardrailResult } from "./guardrail.service";
import { GuardrailError, GuardrailService } from "./guardrail.service";
import { ModerationService } from "./moderation.service";
import { QueryComplexityService } from "./query-complexity.service";
import { QueryRewriterService } from "./query-rewriter.service";
import { SchemaStorageService } from "./schema-storage.service";
import { SqlGeneratorService } from "./sql-generator.service";
import { SqlValidatorService } from "./sql-validator.service";
import { VectorRetrieverService } from "./vector-retriever.service";

/**
 * Chain state interfaces - represent the state at each step of the pipeline
 */

/** Initial input to the chain */
interface ChainInput {
	question: string;
	organizationId: string;
	tenantId?: string;
	lastError?: string;
	maxRetry?: number;
	callbacks?: CallbackHandler[];
	conversationHistory?: Array<{
		question: string;
		sql?: string | null;
		rationale?: string | null;
		created_at?: string | null;
	}>;
	tenantSettings?: {
		tenantFieldName: string;
		tenantFieldType: string;
		enforceTenantIsolation: boolean;
	};
	database?: string;
	dialect?: string;
}

/** State after guardrail check */
interface StateWithGuard extends ChainInput {
	guard: GuardrailResult;
}

/** State after query rewrite */
interface StateWithRewrite extends StateWithGuard {
	rewrittenQuestion: string;
}

/** State after vector retrieval */
interface StateWithRetrieval extends StateWithRewrite {
	retrieval: RetrievalResult;
}

/** State after SQL generation */
interface StateWithGeneration extends StateWithRetrieval {
	generated: GeneratedQuery;
}

/** State after validation */
interface StateWithValidation extends StateWithGeneration {
	validated: boolean;
}

export class QueryRunnerService {
	/**
	 * LangChain Runnable chain for NL to SQL conversion
	 * Orchestrates moderation, guardrails, retrieval, generation, and validation
	 */
	public nl2sqlChain: RunnableSequence<ChainInput, QueryRunResult>;
	private logger = createLogger("query-runner");

	constructor(
		private readonly moderation = new ModerationService(),
		private readonly guardrail = new GuardrailService(),
		private readonly rewriter = new QueryRewriterService(),
		schemaStorage = new SchemaStorageService(),
		private readonly retriever = new VectorRetrieverService(schemaStorage),
		private readonly generator = new SqlGeneratorService(),
		private readonly validator = new SqlValidatorService(),
		private readonly complexity = new QueryComplexityService(),
	) {
		this.nl2sqlChain = RunnableSequence.from([
			// Step 1: Content moderation (throws ModerationError if content violates policies)
			RunnableLambda.from(async (input: ChainInput) => {
				const questionWithHistory = this.buildQuestionWithHistory(
					input.question,
					input.conversationHistory,
				);
				this.logger.debug(
					{ question: input.question },
					"Starting moderation check",
				);
				await this.moderation.moderationChain.invoke(
					{
						...input,
						question: questionWithHistory,
					},
					{
						callbacks: input.callbacks,
						runName: "Content Moderation",
						tags: ["moderation"],
						metadata: {
							operation: "Content Moderation",
							organization_id: input.organizationId,
						},
					},
				);
				return input;
			}),

			// Step 2: Retrieve table_overview for guardrail context
			RunnableLambda.from(
				async (input: ChainInput & { schemaContext?: string }) => {
					this.logger.debug(
						"Moderation passed, retrieving schema context for guardrail",
					);
					const result = (await this.retriever.tableOverviewChain.invoke(
						input,
						{
							callbacks: input.callbacks,
							runName: "Table Overview Retrieval",
							tags: ["retrieval", "table_overview"],
							metadata: {
								operation: "Table Overview Retrieval",
								organization_id: input.organizationId,
							},
						},
					)) as ChainInput & { schemaContext?: string };
					this.logger.debug(
						{ hasSchema: !!result.schemaContext },
						"Schema context retrieved",
					);
					return result;
				},
			),

			// Step 3: Normalize input and attach guardrail result
			RunnablePassthrough.assign({
				guard: RunnableLambda.from(
					async (input: ChainInput & { schemaContext?: string }) => {
						const questionWithHistory = this.buildQuestionWithHistory(
							input.question,
							input.conversationHistory,
						);
						const guard = await this.guardrail.enforce(
							questionWithHistory,
							input.schemaContext,
							input.callbacks,
						);
						this.logger.debug(
							{
								allowed: guard.allowed,
								threat_type: guard.threat_type,
								reason: guard.reason,
							},
							"Guardrail check completed",
						);
						return guard;
					},
				),
			}),

			// Route based on guardrail result
			RunnableBranch.from([
				// Branch 1: Blocked by guardrail
				[
					(state: StateWithGuard) => !state.guard.allowed,
					RunnableLambda.from((state: StateWithGuard) => {
						throw new GuardrailError(
							state.guard.reason ?? "Question rejected",
							state.guard.threat_type,
						);
					}),
				],

				// Default branch: Allowed - continue with full pipeline
				RunnableSequence.from([
					// Rewrite question to standalone form for better RAG retrieval
					RunnableLambda.from(async (state: StateWithGuard) => {
						this.logger.debug(
							"Guardrail passed, rewriting question for retrieval",
						);
						const rewrittenQuestion = await this.rewriter.rewrite(
							state.question,
							state.conversationHistory,
							state.callbacks,
						);
						this.logger.debug(
							{
								original: state.question,
								rewritten: rewrittenQuestion,
								hasHistory: !!state.conversationHistory?.length,
							},
							"Question rewritten for retrieval",
						);
						return {
							...state,
							rewrittenQuestion,
						} as StateWithRewrite;
					}),

					// Retrieve context from vector store using rewritten question
					RunnableLambda.from(async (state: StateWithRewrite) => {
						this.logger.debug(
							"Retrieving context from vector store with rewritten question",
						);
						// Use rewritten question for vector search
						const retrieval = await this.retriever.retrieve(
							state.rewrittenQuestion,
							state.organizationId,
							state.database,
							state.dialect,
						);
						this.logger.debug(
							{
								chunksCount: retrieval.chunks.length,
								dialect: retrieval.dialect,
							},
							"Context retrieved",
						);
						return {
							...state,
							retrieval,
						};
					}),

					// Generate SQL using LLM
					RunnablePassthrough.assign({
						generated: RunnableLambda.from(
							async (state: StateWithRetrieval) => {
								this.logger.debug(
									{
										chunksCount: state.retrieval.chunks.length,
										dialect: state.retrieval.dialect,
										primaryTable: state.retrieval.primaryTable,
									},
									"Context retrieved, generating SQL",
								);
								// Use provided tenantSettings if available, otherwise use retrieved ones
								const tenantSettings =
									state.tenantSettings ?? state.retrieval.tenantSettings;

								const generated = await this.generator.generate({
									question: state.question,
									contextChunks: state.retrieval.chunks,
									dialect: state.retrieval.dialect,
									primaryTable: state.retrieval.primaryTable,
									tenantId: state.tenantId,
									tenantSettings,
									conversationHistory: state.conversationHistory,
									callbacks: state.callbacks,
								});
								this.logger.debug({ sql: generated.sql }, "SQL generated");
								return generated;
							},
						),
					}),

					// Ensure LIMIT then validate (validator requires LIMIT; append if missing)
					RunnablePassthrough.assign({
						validated: RunnableLambda.from((state: StateWithGeneration) => {
							this.logger.debug("Ensuring LIMIT and validating generated SQL");
							const sqlWithLimit = this.validator.ensureLimit(state.generated.sql);
							this.validator.validate(sqlWithLimit);
							this.logger.debug("SQL validation passed");

							// Perform complexity analysis (for logging/monitoring)
							const complexityAnalysis = this.complexity.analyze(
								sqlWithLimit,
								state.retrieval.chunks,
							);
							this.logger.debug(
								{
									riskLevel: complexityAnalysis.riskLevel,
									columnCount: complexityAnalysis.columnCount,
									groupByColumns: complexityAnalysis.groupByColumnCount,
									estimatedCardinality: complexityAnalysis.estimatedCardinality,
									warnings: complexityAnalysis.warnings,
								},
								"Query complexity analysis",
							);

							// Log warnings if present
							if (complexityAnalysis.warnings.length > 0) {
								this.logger.warn(
									{
										sql: sqlWithLimit,
										warnings: complexityAnalysis.warnings,
									},
									"Query has complexity warnings",
								);
							}

							// If we appended LIMIT, merge updated sql so final result uses it
							if (sqlWithLimit !== state.generated.sql) {
								return {
									validated: true,
									generated: { ...state.generated, sql: sqlWithLimit },
								};
							}
							return { validated: true };
						}),
					}),

					// Transform to final QueryRunResult format
					RunnableLambda.from((state: StateWithValidation): QueryRunResult => {
						this.logger.debug(
							"Pipeline completed, transforming to final result",
						);
						return {
							...state.generated,
							context: state.retrieval.chunks,
							guardrail_notes: state.guard.reason,
							database: state.retrieval.database,
							table: state.retrieval.primaryTable,
						};
					}),
				]),
			]),
		]);
	}

	/**
	 * Run the NL to SQL pipeline
	 * @param question The natural language question
	 * @param organizationId The organization ID for context retrieval
	 * @param tenantId Optional tenant ID to include in SQL generation prompt
	 * @param lastError Optional error from client-side SQL execution
	 * @param previousSql Optional previous SQL that failed (for repair)
	 * @param callbacks Optional LangChain callbacks for tracing
	 */
	async run(
		question: string,
		organizationId: string,
		tenantId?: string,
		lastError?: string,
		previousSql?: string,
		callbacks?: CallbackHandler[],
		tenantSettings?: {
			tenantFieldName: string;
			tenantFieldType: string;
			enforceTenantIsolation: boolean;
		},
		database?: string,
		dialect?: string,
		conversationHistory?: ChainInput["conversationHistory"],
	): Promise<QueryRunResult> {
		// If lastError is provided, use repair chain
		if (lastError && previousSql) {
			this.logger.debug(
				{ hasError: true, hasPreviousSql: true },
				"Using SQL repair mode",
			);
			return await this.runRepair(
				question,
				organizationId,
				tenantId,
				previousSql,
				lastError,
				callbacks,
				conversationHistory,
			);
		}

		// Otherwise, run the normal generation chain
		this.logger.debug("Starting normal SQL generation pipeline");
		const result = await this.nl2sqlChain.invoke(
			{
				question,
				organizationId,
				tenantId,
				callbacks,
				conversationHistory,
				tenantSettings,
				database,
				dialect,
			},
			{
				runName: "NL to SQL Pipeline",
				tags: ["nl_to_sql", "generate"],
				metadata: {
					operation: "NL to SQL Generate",
					organization_id: organizationId,
					tenant_id: tenantId,
					database,
					dialect,
				},
			},
		);

		return result;
	}

	/**
	 * Repair SQL based on client-provided error
	 */
	private async runRepair(
		question: string,
		organizationId: string,
		tenantId: string | undefined,
		previousSql: string,
		error: string,
		callbacks?: CallbackHandler[],
		conversationHistory?: ChainInput["conversationHistory"],
	): Promise<QueryRunResult> {
		const questionWithHistory = this.buildQuestionWithHistory(
			question,
			conversationHistory,
		);
		this.logger.debug(
			{ error: error.substring(0, 200) },
			"Starting SQL repair pipeline",
		);

		// Run moderation check (throws if content violates policies)
		this.logger.debug("Running moderation check for repair");
		await this.moderation.moderationChain.invoke(
			{
				question: questionWithHistory,
				organizationId,
				tenantId,
			},
			{
				callbacks,
				tags: ["moderation", "repair"],
				metadata: {
					operation: "Content Moderation (Repair)",
					organization_id: organizationId,
				},
			},
		);

		// Retrieve schema context for guardrail
		this.logger.debug("Retrieving schema context for guardrail (repair mode)");
		const schemaContext = await this.retriever.retrieveTableOverview(
			question,
			organizationId,
		);
		this.logger.debug(
			{ hasSchema: !!schemaContext },
			"Schema context retrieved for repair",
		);

		// Run guardrail check with schema context
		this.logger.debug("Running guardrail check for repair");
		const guardrail = await this.guardrail.enforce(
			questionWithHistory,
			schemaContext,
			callbacks,
		);
		this.logger.debug(
			{
				allowed: guardrail.allowed,
				threat_type: guardrail.threat_type,
			},
			"Guardrail check completed for repair",
		);

		if (!guardrail.allowed) {
			throw new GuardrailError(
				guardrail.reason ?? "Question rejected",
				guardrail.threat_type,
			);
		}

		// Rewrite question for better retrieval
		this.logger.debug("Rewriting question for repair retrieval");
		const rewrittenQuestion = await this.rewriter.rewrite(
			question,
			conversationHistory,
			callbacks,
		);
		this.logger.debug(
			{ original: question, rewritten: rewrittenQuestion },
			"Question rewritten for repair",
		);

		// Get retrieval context using rewritten question
		this.logger.debug("Retrieving context for repair");
		const retrieval = await this.retriever.retrieve(
			rewrittenQuestion,
			organizationId,
		);
		this.logger.debug(
			{
				chunksCount: retrieval.chunks.length,
				dialect: retrieval.dialect,
			},
			"Context retrieved for repair",
		);

		// Repair the SQL
		this.logger.debug({ previousSql }, "Attempting to repair SQL");
		const repaired = await this.generator.repair({
			question,
			contextChunks: retrieval.chunks,
			dialect: retrieval.dialect,
			primaryTable: retrieval.primaryTable,
			previousSql,
			error,
			tenantId,
			conversationHistory,
			callbacks,
		});
		this.logger.debug({ repairedSql: repaired.sql }, "SQL repaired");

		// Ensure LIMIT then validate
		const repairedSqlWithLimit = this.validator.ensureLimit(repaired.sql);
		this.logger.debug("Validating repaired SQL");
		this.validator.validate(repairedSqlWithLimit);
		this.logger.debug("Repaired SQL validation passed");

		// Perform complexity analysis
		const complexityAnalysis = this.complexity.analyze(
			repairedSqlWithLimit,
			retrieval.chunks,
		);
		this.logger.debug(
			{
				riskLevel: complexityAnalysis.riskLevel,
				columnCount: complexityAnalysis.columnCount,
				groupByColumns: complexityAnalysis.groupByColumnCount,
				warnings: complexityAnalysis.warnings,
			},
			"Repaired query complexity analysis",
		);

		if (complexityAnalysis.warnings.length > 0) {
				this.logger.warn(
					{
						sql: repairedSqlWithLimit,
						warnings: complexityAnalysis.warnings,
					},
					"Repaired query has complexity warnings",
				);
			}

		// Return the repaired result (use sql with LIMIT if we appended it)
		return {
			...repaired,
			sql: repairedSqlWithLimit,
			context: retrieval.chunks,
			guardrail_notes: guardrail.reason,
			database: retrieval.database,
			table: retrieval.primaryTable,
		};
	}

	private buildQuestionWithHistory(
		question: string,
		conversationHistory?: ChainInput["conversationHistory"],
	): string {
		if (!conversationHistory?.length) return question;

		const recentTurns = conversationHistory.slice(-3);
		const historyBlock = recentTurns
			.map((turn, index) => {
				const parts = [`Turn ${index + 1} - Question: ${turn.question}`];
				if (turn.rationale) {
					parts.push(`Rationale: ${turn.rationale}`);
				}
				if (turn.sql) {
					parts.push(`SQL: ${turn.sql}`);
				}
				return parts.join("\n");
			})
			.join("\n\n");

		return `Conversation history:\n${historyBlock}\n\nCurrent question: ${question}`;
	}
}
