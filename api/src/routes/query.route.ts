import crypto from "node:crypto";
import type { Hono } from "hono";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import { createLogger } from "../lib/logger";
import { type QueryRequest, queryRequestSchema } from "../schemas/query.schema";
import { GuardrailError } from "../services/guardrail.service";
import { ModerationError } from "../services/moderation.service";
import type { QueryRunnerService } from "../services/query-runner.service";
import type { SessionService } from "../services/session.service";
import type { SqlLogService } from "../services/sql-log.service";
import type { AppContext } from "../types/app";
import { guardrailThreatToErrorCode, QueryErrorCode } from "../types/errors";

interface QueryRouteDeps {
	queryRunner: QueryRunnerService;
	sqlLogService: SqlLogService;
	sessionService: SessionService;
}

export const registerQueryRoutes = (
	app: Hono<AppContext>,
	{ queryRunner, sqlLogService, sessionService }: QueryRouteDeps,
) => {
	const logger = createLogger("query-route");

	app.post("/query", async (c) => {
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
			logger.debug({ body }, "Received query request");

			validated = queryRequestSchema.parse(body);

			logger.debug(
				{
					question: validated.question,
					organizationId: auth.organizationId,
					tenantId: auth.tenantId,
					hasLastError: !!validated.last_error,
					hasPreviousSQL: !!validated.previous_sql,
				},
				"Request validated, starting query pipeline",
			);

			// Create Langfuse callback for tracing
			const callback = createLangfuseCallback({
				organizationId: auth.organizationId,
				sessionId: langfuseSessionId,
				tenantId: auth.tenantId,
				userId: auth.userId,
				operation: "query_nl_to_sql",
				tags: ["nl_to_sql", validated.last_error ? "repair" : "generate"],
			});

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
			}));

			const result = await queryRunner.run(
				validated.question,
				auth.organizationId,
				auth.tenantId,
				validated.last_error,
				validated.previous_sql,
				callback ? [callback] : undefined,
				validated.tenant_settings,
				validated.database,
				validated.dialect,
				conversationHistory,
			);

			// For PostgreSQL, params array order matches $1, $2, $3
			logger.info(
				{
					sql: result.sql,
					params: result.params,
					dialect: result.dialect,
					contextChunks: result.context.length,
					hasGuardrailNotes: !!result.guardrail_notes,
				},
				"Query completed successfully",
			);

			// Create draft log entry for successful SQL generation
			try {
				// Extract target identifiers from context
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
				// Log the error but don't fail the request
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
			});
		} catch (error) {
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

				// Log failed generation if we have validated data
				if (validated) {
					try {
						await sqlLogService.createFailedLog(auth, {
							question: validated.question,
							error: `Moderation: ${error.message}`,
						});
					} catch (logError) {
						logger.error({ err: logError }, "Failed to create failed SQL log");
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

				// Log failed generation if we have validated data
				if (validated) {
					try {
						await sqlLogService.createFailedLog(auth, {
							question: validated.question,
							error: `Guardrail: ${error.message} (${error.threat_type})`,
						});
					} catch (logError) {
						logger.error({ err: logError }, "Failed to create failed SQL log");
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

			// Handle other errors
			logger.error({ err: error }, "Query failed with error");
			const message = error instanceof Error ? error.message : "Unknown error";
			const status = 500;

			// Log failed generation if we have validated data
			if (validated) {
				try {
					await sqlLogService.createFailedLog(auth, {
						question: validated.question,
						error: message,
					});
				} catch (logError) {
					logger.error({ err: logError }, "Failed to create failed SQL log");
				}
			}

			return c.json(
				{
					success: false,
					error: message,
					code: QueryErrorCode.INTERNAL_ERROR,
				},
				status,
			);
		}
	});
};
