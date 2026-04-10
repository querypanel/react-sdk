import type { Hono } from "hono";
import { createLogger } from "../lib/logger";
import type { TelemetryContext } from "../lib/telemetry";
import {
	type RewriteDatefilterRequest,
	rewriteDatefilterRequestSchema,
} from "../schemas/rewrite-datefilter.schema";
import type { QueryRunnerV2Service } from "../services/v2/query-runner-v2.service";
import type { SessionService } from "../services/session.service";
import type { SqlLogService } from "../services/sql-log.service";
import type { AppContext } from "../types/app";
import { QueryErrorCode } from "../types/errors";

interface RewriteDatefilterRouteDeps {
	queryRunnerV2: QueryRunnerV2Service;
	sqlLogService: SqlLogService;
	sessionService: SessionService;
}

export const registerRewriteDatefilterRoutes = (
	app: Hono<AppContext>,
	{ queryRunnerV2, sqlLogService, sessionService }: RewriteDatefilterRouteDeps,
) => {
	const logger = createLogger("rewrite-datefilter-route");

	app.post("/v2/rewrite-datefilter", async (c) => {
		c.header("Deprecation", "true");
		c.header("Sunset", "2026-06-01");

		const auth = c.get("auth");

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

		let validated: RewriteDatefilterRequest | undefined;

		try {
			const body = await c.req.json();
			logger.debug({ body }, "Received rewrite-datefilter request");

			validated = rewriteDatefilterRequestSchema.parse(body);

			if (validated.session_id) {
				c.header("x-querypanel-session-id", validated.session_id);
			}

			const recentTurns = validated.session_id
				? await sessionService.getRecentTurns(auth, validated.session_id, 5)
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
				userId: auth.userId,
			};

			const result = await queryRunnerV2.runDateFilterRewrite({
				previousSql: validated.previous_sql,
				previousParams: validated.previous_params,
				dateRange: validated.date_range,
				question: validated.question,
				tenantId: auth.tenantId,
				tenantSettings: validated.tenant_settings,
				database: validated.database,
				dialect: validated.dialect,
				conversationHistory,
				telemetry,
			});

			logger.info(
				{
					sql: result.sql,
					dialect: result.dialect,
					totalDurationMs: result.trace.totalDurationMs,
					steps: result.trace.steps.map(
						(s) => `${s.step}(${s.durationMs}ms)`,
					),
				},
				"Date filter rewrite completed successfully",
			);

			// Create draft log entry
			try {
				const queryId = await sqlLogService.createDraftLog(auth, {
					sql: result.sql,
					params: result.params,
					question: validated.question,
					dialect: result.dialect,
					rationale: result.rationale,
					contextTargetIdentifiers: [],
				});
				result.queryId = queryId;
			} catch (logError) {
				logger.error(
					{ err: logError },
					"Failed to create SQL log, continuing with response",
				);
			}

			// Store session turn so subsequent queries have context
			if (validated.session_id) {
				try {
					await sessionService.addTurn(auth, validated.session_id, {
						question: validated.question,
						sql: result.sql,
						rationale: result.rationale,
					});
				} catch (sessionError) {
					logger.error(
						{ err: sessionError },
						"Failed to store session turn, continuing with response",
					);
				}
			}

			return c.json({
				success: true,
				sql: result.sql,
				params: result.params,
				dialect: result.dialect,
				database: result.database,
				rationale: result.rationale,
				queryId: result.queryId,
				trace: {
					totalDurationMs: result.trace.totalDurationMs,
					steps: result.trace.steps.map((s) => ({
						step: s.step,
						durationMs: s.durationMs,
					})),
				},
			});
		} catch (error) {
			logger.error({ err: error }, "Date filter rewrite failed");
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
