import crypto from "node:crypto";
import type { Hono } from "hono";
import { createLogger } from "../lib/logger";
import type { TelemetryContext } from "../lib/telemetry";
import {
	type QueryRequest,
	queryRequestSchema,
} from "../schemas/query.schema";
import { GuardrailError } from "../services/guardrail.service";
import { ModerationError } from "../services/moderation.service";
import {
	ClarificationNeededError,
	type QueryRunnerV2Service,
} from "../services/v2/query-runner-v2.service";
import type { SessionService } from "../services/session.service";
import type { SqlLogService } from "../services/sql-log.service";
import type { AppContext } from "../types/app";
import { guardrailThreatToErrorCode, QueryErrorCode } from "../types/errors";

interface QueryV2RouteDeps {
	queryRunnerV2: QueryRunnerV2Service;
	sqlLogService: SqlLogService;
	sessionService: SessionService;
}

export const registerQueryV2Routes = (
	app: Hono<AppContext>,
	{ queryRunnerV2, sqlLogService, sessionService }: QueryV2RouteDeps,
) => {
	const logger = createLogger("query-v2-route");

	app.post("/v2/query", async (c) => {
		const auth = c.get("auth");
		const langfuseSessionId = c.req.header("x-session-id") ?? undefined;

		// Validate auth context has required fields
		if (!auth.organizationId || !auth.tenantId) {
			return c.json(
				{
					success: false,
					error: "Authentication required with organization_id and tenant_id",
					code: QueryErrorCode.AUTHENTICATION_REQUIRED,
				},
				401,
			);
		}

		let validated: QueryRequest | undefined;

		try {
			const body = await c.req.json();
			logger.debug({ body }, "Received v2 query request");

			validated = queryRequestSchema.parse(body);

			logger.debug(
				{
					question: validated.question,
					organizationId: auth.organizationId,
					tenantId: auth.tenantId,
					hasLastError: !!validated.last_error,
					hasPreviousSQL: !!validated.previous_sql,
				},
				"Request validated, starting v2 query pipeline",
			);

			const querypanelSessionId = validated.session_id ?? crypto.randomUUID();
			c.header("x-querypanel-session-id", querypanelSessionId);

			const recentTurns = querypanelSessionId
				? await sessionService.getRecentTurns(auth, querypanelSessionId, 5)
				: [];
			const conversationHistory = recentTurns.map((turn) => ({
				question: turn.question,
				sql: turn.sql,
				rationale: turn.rationale,
				created_at: turn.created_at,
				params: turn.params,
			}));

			const telemetry: TelemetryContext = {
				organizationId: auth.organizationId,
				tenantId: auth.tenantId,
				sessionId: langfuseSessionId,
				userId: auth.userId,
			};

			const result = await queryRunnerV2.run(
				validated.question,
				auth.organizationId,
				auth.tenantId,
				validated.last_error,
				validated.previous_sql,
				validated.tenant_settings,
				validated.database,
				validated.dialect,
				validated.system_prompt,
				conversationHistory,
				telemetry,
				validated.max_retry,
				validated.model,
			);

			// For PostgreSQL, params array order matches $1, $2, $3
			logger.info(
				{
					sql: result.sql,
					params: result.params,
					dialect: result.dialect,
					contextChunks: result.context.length,
					hasGuardrailNotes: !!result.guardrail_notes,
					totalDurationMs: result.trace.totalDurationMs,
					steps: result.trace.steps.map(
						(s) => `${s.step}(${s.durationMs}ms)`,
					),
				},
				"V2 query completed successfully",
			);

			// Create draft log entry for successful SQL generation
			try {
				const contextTargetIdentifiers = result.context
					.map((doc) => {
						const targetId = doc.metadata?.target_identifier;
						return typeof targetId === "string" ? targetId : undefined;
					})
					.filter((id): id is string => typeof id === "string");

				const queryId = await sqlLogService.createDraftLog(auth, {
					sql: result.sql,
					params: result.params,
					question: validated.question,
					dialect: result.dialect,
					rationale: result.rationale,
					contextTargetIdentifiers,
				});
				result.queryId = queryId;
				logger.debug(
					{ queryId, contextTargetIdentifiers },
					"Created draft SQL log",
				);
			} catch (logError) {
				logger.error(
					{ err: logError },
					"Failed to create SQL log, continuing with response",
				);
			}

			// Store session turn for context-aware queries
			if (querypanelSessionId) {
				try {
					await sessionService.addTurn(auth, querypanelSessionId, {
						question: validated.question,
						sql: result.sql,
						rationale: result.rationale,
						params: result.params,
						modificationType: result.modification_type,
					});
				} catch (sessionError) {
					logger.error(
						{ err: sessionError, sessionId: querypanelSessionId },
						"Failed to store session turn",
					);
				}
			}

			return c.json({
				success: true,
				sql: result.sql,
				params: result.params,
				dialect: result.dialect,
				database: result.database,
				table: result.table,
				rationale: result.rationale,
				queryId: result.queryId,
				modification_type: result.modification_type,
				// v2-specific additions
				intent: result.intent
					? {
							intent: result.intent.intent,
							confidence: result.intent.confidence,
							plan: result.intent.plan,
							ambiguities: result.intent.ambiguities,
						}
					: undefined,
				trace: {
					totalDurationMs: result.trace.totalDurationMs,
					steps: result.trace.steps.map((s) => ({
						step: s.step,
						durationMs: s.durationMs,
					})),
				},
			});
		} catch (error) {
			// Handle clarification needed (v2-specific)
			if (error instanceof ClarificationNeededError) {
				logger.info(
					{ ambiguities: error.ambiguities },
					"Query needs clarification",
				);

				return c.json(
					{
						success: false,
						error: error.message,
						code: "CLARIFICATION_NEEDED" as const,
						details: {
							ambiguities: error.ambiguities,
						},
					},
					422,
				);
			}

			// Handle moderation errors
			if (error instanceof ModerationError) {
				logger.warn(
					{
						flagged: error.flagged,
						categories: Object.entries(error.categories)
							.filter(([_, flagged]) => flagged)
							.map(([category]) => category),
					},
					"Query blocked by moderation",
				);

				if (validated) {
					try {
						await sqlLogService.createFailedLog(auth, {
							question: validated.question,
							error: `Moderation: ${error.message}`,
						});
					} catch (logError) {
						logger.error(
							{ err: logError },
							"Failed to create failed SQL log",
						);
					}
				}

				return c.json(
					{
						success: false,
						error: error.message,
						code: QueryErrorCode.MODERATION_FAILED,
						details: {
							flagged: error.flagged,
							categories: Object.entries(error.categories)
								.filter(([_, flagged]) => flagged)
								.map(([category]) => category),
						},
					},
					400,
				);
			}

			// Handle guardrail errors
			if (error instanceof GuardrailError) {
				logger.warn(
					{ threat_type: error.threat_type },
					"Query blocked by guardrail",
				);

				if (validated) {
					try {
						await sqlLogService.createFailedLog(auth, {
							question: validated.question,
							error: `Guardrail: ${error.message} (${error.threat_type})`,
						});
					} catch (logError) {
						logger.error(
							{ err: logError },
							"Failed to create failed SQL log",
						);
					}
				}

				return c.json(
					{
						success: false,
						error: error.message,
						code: guardrailThreatToErrorCode(error.threat_type),
						details: {
							threat_type: error.threat_type,
						},
					},
					400,
				);
			}

			// Handle other errors — attach trace if available
			logger.error({ err: error }, "V2 query failed with error");
			const message =
				error instanceof Error ? error.message : "Unknown error";

			const pipelineTrace = (error as any)?.__pipelineTrace;

			if (validated) {
				try {
					await sqlLogService.createFailedLog(auth, {
						question: validated.question,
						error: message,
					});
				} catch (logError) {
					logger.error(
						{ err: logError },
						"Failed to create failed SQL log",
					);
				}
			}

			return c.json(
				{
					success: false,
					error: message,
					code: QueryErrorCode.INTERNAL_ERROR,
					...(pipelineTrace
						? {
								trace: {
									totalDurationMs: pipelineTrace.totalDurationMs,
									steps: pipelineTrace.steps.map(
										(s: any) => ({
											step: s.step,
											durationMs: s.durationMs,
										}),
									),
								},
							}
						: {}),
				},
				500,
			);
		}
	});
};
