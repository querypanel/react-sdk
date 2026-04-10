import {
	QueryPanelSdkAPI,
	type RequestHandlerOptions,
	type RequestHandlerResult,
} from "@querypanel/node-sdk";
import crypto from "node:crypto";
import { createLogger } from "../lib/logger";
import type { PipelineTrace } from "../lib/pipeline";
import type { TelemetryContext } from "../lib/telemetry";
import { chartRequestSchema } from "../schemas/chart.schema";
import { queryRequestSchema } from "../schemas/query.schema";
import { vizspecRequestSchema } from "../schemas/vizspec.schema";
import type { AuthContext } from "../types/auth";
import { QueryErrorCode, guardrailThreatToErrorCode } from "../types/errors";
import type { ChartGeneratorService } from "./chart-generator.service";
import type {
	ClickHouseClientFn,
	DatasourceService,
} from "./datasource.service";
import { GuardrailError } from "./guardrail.service";
import { ModerationError } from "./moderation.service";
import type { SessionService } from "./session.service";
import type { SqlLogService } from "./sql-log.service";
import {
	ClarificationNeededError,
	type QueryRunnerV2Service,
} from "./v2/query-runner-v2.service";
import type { VizSpecGeneratorService } from "./vizspec-generator.service";

const logger = createLogger("embedded-querypanel-sdk");

export interface EmbeddedQueryPanelDeps {
	queryRunnerV2: QueryRunnerV2Service;
	vizspecGenerator: VizSpecGeneratorService;
	datasourceService: DatasourceService;
	chartGenerator: ChartGeneratorService;
	sessionService: SessionService;
	sqlLogService: SqlLogService;
}

type EmbeddedClient = NonNullable<
	Awaited<ReturnType<DatasourceService["getEmbedClient"]>>
>;

function attachEmbeddedClient(
	sdk: QueryPanelSdkAPI,
	embed: EmbeddedClient,
	databaseName: string,
) {
	if (embed.dialect === "postgres") {
		sdk.attachPostgres(databaseName, embed.clientFn, {
			database: databaseName,
			tenantFieldName: embed.metadata.tenantFieldName ?? undefined,
			tenantFieldType: embed.metadata.tenantFieldType ?? undefined,
			enforceTenantIsolation: embed.metadata.enforceTenantIsolation,
		});
		return;
	}

	if (embed.dialect === "clickhouse") {
		sdk.attachClickhouse(databaseName, embed.clientFn as ClickHouseClientFn, {
			database: databaseName,
			tenantFieldName: embed.metadata.tenantFieldName ?? undefined,
			tenantFieldType: embed.metadata.tenantFieldType ?? undefined,
			enforceTenantIsolation: embed.metadata.enforceTenantIsolation,
		});
		return;
	}

	sdk.attachBigQuery(databaseName, embed.clientFn, {
		projectId: embed.metadata.projectId,
		datasetProjectId: embed.metadata.datasetProjectId,
		dataset: embed.metadata.dataset,
		location: embed.metadata.location,
		database: databaseName,
		tenantFieldName: embed.metadata.tenantFieldName ?? undefined,
		tenantFieldType: embed.metadata.tenantFieldType ?? undefined,
		enforceTenantIsolation: embed.metadata.enforceTenantIsolation,
	});
}

export function createEmbeddedRequestHandler(
	auth: AuthContext,
	deps: EmbeddedQueryPanelDeps,
): (opts: RequestHandlerOptions) => Promise<RequestHandlerResult> {
	const {
		queryRunnerV2,
		chartGenerator,
		vizspecGenerator,
		sessionService,
		sqlLogService,
	} = deps;
	const organizationId = auth.organizationId ?? "";
	const tenantId = auth.tenantId ?? "";

	return async (opts: RequestHandlerOptions): Promise<RequestHandlerResult> => {
		const { method, path, body } = opts;

		if (
			(method === "POST" && path === "/query") ||
			(method === "POST" && path === "/v2/query")
		) {
			const parsed = queryRequestSchema.safeParse(body);
			if (!parsed.success) {
				return {
					data: {
						success: false,
						error: "Invalid request body",
						code: QueryErrorCode.VALIDATION_ERROR,
						details: parsed.error.flatten(),
					},
				};
			}

			const validated = parsed.data;
			const querypanelSessionId = validated.session_id ?? crypto.randomUUID();
			const headers = new Headers();
			headers.set("x-querypanel-session-id", querypanelSessionId);

			try {
				const recentTurns = querypanelSessionId
					? await sessionService.getRecentTurns(auth, querypanelSessionId, 5)
					: [];
				const conversationHistory = recentTurns.map((turn) => ({
					question: turn.question,
					sql: turn.sql,
					rationale: turn.rationale,
					created_at: turn.created_at,
					...(turn.params != null && { params: turn.params }),
				}));

				const telemetry: TelemetryContext = {
					organizationId,
					tenantId,
					sessionId: undefined,
					userId: auth.userId,
				};

				const result = await queryRunnerV2.run(
					validated.question,
					organizationId,
					tenantId,
					validated.last_error,
					validated.previous_sql,
					validated.tenant_settings,
					validated.database,
					validated.dialect,
					undefined,
					conversationHistory,
					telemetry,
					validated.max_retry,
					validated.model,
				);

				let queryId = result.queryId;
				try {
					const contextTargetIdentifiers = result.context
						.map((doc) => {
							const targetId = doc.metadata?.target_identifier;
							return typeof targetId === "string" ? targetId : undefined;
						})
						.filter((id): id is string => typeof id === "string");

					queryId = await sqlLogService.createDraftLog(auth, {
						sql: result.sql,
						params: result.params,
						question: validated.question,
						dialect: result.dialect,
						rationale: result.rationale,
						contextTargetIdentifiers,
					});
				} catch (logErr) {
					logger.warn({ err: logErr }, "Failed to create draft SQL log");
				}

				if (querypanelSessionId) {
					try {
						await sessionService.addTurn(auth, querypanelSessionId, {
							question: validated.question,
							sql: result.sql,
							rationale: result.rationale,
							params: result.params,
							modificationType: result.modification_type,
						});
					} catch (sessionErr) {
						logger.warn({ err: sessionErr }, "Failed to store session turn");
					}
				}

				return {
					data: {
						success: true,
						sql: result.sql,
						params: result.params,
						dialect: result.dialect,
						database: result.database,
						table: result.table,
						rationale: result.rationale,
						queryId,
						modification_type: result.modification_type,
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
					},
					headers,
				};
			} catch (error) {
				if (error instanceof ClarificationNeededError) {
					return {
						data: {
							success: false,
							error: error.message,
							code: "CLARIFICATION_NEEDED" as const,
							details: { ambiguities: error.ambiguities },
						},
					};
				}

				if (error instanceof ModerationError) {
					return {
						data: {
							success: false,
							error: error.message,
							code: QueryErrorCode.MODERATION_FAILED,
							details: {
								flagged: error.flagged,
								categories: Object.entries(error.categories)
									.filter(([, flagged]) => flagged)
									.map(([category]) => category),
							},
						},
					};
				}

				if (error instanceof GuardrailError) {
					return {
						data: {
							success: false,
							error: error.message,
							code: guardrailThreatToErrorCode(error.threat_type),
							details: { threat_type: error.threat_type },
						},
					};
				}

				const message = error instanceof Error ? error.message : "Unknown error";
				const pipelineTrace = (error as Error & { __pipelineTrace?: PipelineTrace })
					.__pipelineTrace;

				return {
					data: {
						success: false,
						error: message,
						code: QueryErrorCode.INTERNAL_ERROR,
						...(pipelineTrace
							? {
									trace: {
										totalDurationMs: pipelineTrace.totalDurationMs,
										steps: pipelineTrace.steps.map((s) => ({
											step: s.step,
											durationMs: s.durationMs,
										})),
									},
								}
							: {}),
					},
				};
			}
		}

		if (method === "POST" && path === "/chart") {
			const parsed = chartRequestSchema.safeParse(body);
			if (!parsed.success) {
				return {
					data: {
						error: "Invalid chart request",
						validation: parsed.error.flatten(),
					},
				};
			}

			const validated = parsed.data;
			try {
				const result = await chartGenerator.generateWithRetry({
					question: validated.question,
					sql: validated.sql,
					rationale: validated.rationale,
					fields: validated.fields,
					rows: validated.rows,
					maxRetries: validated.max_retries,
					queryId: validated.query_id,
					encodingHints: validated.encoding_hints,
				});
				return { data: result };
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				return { data: { error: message } };
			}
		}

		if (method === "POST" && path === "/vizspec") {
			const parsed = vizspecRequestSchema.safeParse(body);
			if (!parsed.success) {
				return {
					data: {
						error: "Invalid vizspec request",
						validation: parsed.error.flatten(),
					},
				};
			}

			const validated = parsed.data;
			try {
				const result = await vizspecGenerator.generateWithRetry({
					question: validated.question,
					sql: validated.sql,
					rationale: validated.rationale,
					fields: validated.fields,
					rows: validated.rows,
					maxRetries: validated.max_retries,
					queryId: validated.query_id,
					encodingHints: validated.encoding_hints,
					supportedChartTypes: validated.supported_chart_types,
				});
				return { data: result };
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				return { data: { error: message } };
			}
		}

		logger.warn({ path, method }, "Unhandled embedded SDK path");
		return {
			data: {
				success: false,
				error: `Unhandled path: ${method} ${path}`,
				code: QueryErrorCode.INTERNAL_ERROR,
			},
		};
	};
}

export async function createAttachedSdk(
	auth: AuthContext,
	deps: EmbeddedQueryPanelDeps,
	options?: {
		datasourceId?: string;
		enforceTenantIsolation?: boolean;
		tenantId?: string;
	},
) {
	const embed = await deps.datasourceService.getEmbedClient(auth, {
		datasourceId: options?.datasourceId,
	});

	if (!embed) {
		throw new Error(
			"No datasource available. Add a Postgres, ClickHouse, or BigQuery datasource for this organization.",
		);
	}

	const organizationId = auth.organizationId ?? "";
	const tenantId = options?.tenantId ?? auth.tenantId ?? "";
	const sdk = QueryPanelSdkAPI.withCallbacks(
		organizationId,
		createEmbeddedRequestHandler(auth, deps),
		tenantId ? { defaultTenantId: tenantId } : {},
	);

	const databaseName = embed.metadata.database ?? "db";
	attachEmbeddedClient(
		sdk,
		options?.enforceTenantIsolation === undefined
			? embed
			: ({
					...embed,
					metadata: {
						...embed.metadata,
						enforceTenantIsolation: options.enforceTenantIsolation,
					},
				} as EmbeddedClient),
		databaseName,
	);

	return {
		sdk,
		embed,
		databaseName,
	};
}

export async function executeEmbeddedSql(
	auth: AuthContext,
	deps: EmbeddedQueryPanelDeps,
	input: {
		sql: string;
		params?: Record<string, unknown>;
		database?: string;
		datasourceId?: string;
	},
) {
	const { sdk, embed, databaseName } = await createAttachedSdk(auth, deps, {
		datasourceId: input.datasourceId,
		enforceTenantIsolation: Boolean(auth.tenantId),
		tenantId: auth.tenantId,
	});

	return {
		execution: await sdk.runSqlForDashboard(
			{
				sql: input.sql,
				params: input.params,
				database: input.database ?? databaseName,
			},
			{ tenantId: auth.tenantId! },
		),
		embed,
		databaseName,
	};
}
