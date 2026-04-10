/**
 * Embed routes – customer-facing API (JWT auth).
 *
 * Route summary:
 * - GET  /datasources              List datasources for org (safe fields only). No execution; all dialects listed.
 * - POST /ai/generate-chart-with-sql  NL → SQL → execute → chart. Supports Postgres, ClickHouse, and BigQuery (by datasource dialect).
 * - POST /query/run-sql           Run provided SQL with tenant isolation. Supports Postgres, ClickHouse, and BigQuery (by datasource dialect).
 *
 * In-process handler (createEmbedRequestHandler) handles SDK callbacks:
 * - POST /query, POST /v2/query   NL → SQL (dialect from request/retrieval; execution uses attached DB).
 * - POST /chart                   Rows → Vega-Lite.
 * - POST /vizspec                 Rows → VizSpec.
 */
import type { Hono } from "hono";
import { createLogger } from "../lib/logger";
import {
	listDatasourcesForOrg,
} from "../services/datasource.service";
import {
	createAttachedSdk,
	executeEmbeddedSql,
	type EmbeddedQueryPanelDeps,
} from "../services/embedded-querypanel-sdk.service";
import type { AppContext } from "../types/app";
import { QueryErrorCode } from "../types/errors";

const logger = createLogger("embed-route");

type EmbedRouteDeps = EmbeddedQueryPanelDeps;

export const registerEmbedRoutes = (
	app: Hono<AppContext>,
	deps: EmbedRouteDeps,
) => {
	const { datasourceService } = deps;

	/**
	 * GET /datasources
	 * List datasources for the customer's organization (from JWT). Returns safe fields only (no secrets).
	 */
	app.get("/datasources", async (c) => {
		const auth = c.get("auth");
		if (!auth.organizationId) {
			return c.json(
				{
					success: false,
					error: "Authentication required with organization_id",
					code: QueryErrorCode.AUTHENTICATION_REQUIRED,
				},
				401,
			);
		}
		try {
			const datasources = await listDatasourcesForOrg(auth.organizationId);
			return c.json({datasources});
		} catch (error) {
			logger.error({ err: error }, "List datasources failed");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ success: false, error: message, code: QueryErrorCode.INTERNAL_ERROR },
				500,
			);
		}
	});

	/**
	 * POST /ai/generate-chart-with-sql
	 * Natural language question → generate SQL, validate & run locally, generate chart.
	 * Uses QueryPanelSdkAPI.withCallbacks so /query and /chart are handled in-process.
	 */
	app.post("/ai/generate-chart-with-sql", async (c) => {
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

		let body: {
			question?: string;
			prompt?: string;
			database?: string;
			chartType?: "vega-lite" | "vizspec";
			datasourceId?: string;
			datasourceIds?: string[];
			dashboardId?: string;
			tenantFieldName?: string;
			previewTenantId?: string;
			conversationHistory?: Array<{ role: string; content: string }>;
			session_id?: string;
			querypanelSessionId?: string;
			model?: string;
		};
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{ success: false, error: "Invalid JSON body", code: QueryErrorCode.VALIDATION_ERROR },
				400,
			);
		}
		const question = body?.question ?? body?.prompt;
		if (!question || typeof question !== "string") {
			return c.json(
				{ success: false, error: "question or prompt is required", code: QueryErrorCode.VALIDATION_ERROR },
				400,
			);
		}
		const datasourceId = body.datasourceId ?? body.datasourceIds?.[0];

		const embed = await datasourceService.getEmbedClient(auth, {
			datasourceId,
		});
		if (!embed) {
			return c.json(
				{
					success: false,
					error:
						"No datasource available. Add a Postgres, ClickHouse, or BigQuery datasource for this organization.",
					code: QueryErrorCode.INTERNAL_ERROR,
				},
				503,
			);
		}

		const { sdk, databaseName } = await createAttachedSdk(auth, deps, {
			datasourceId,
		});
		const tenId = auth.tenantId ?? "";

		const sessionIdForAsk =
			body.session_id ?? body.querypanelSessionId ?? undefined;
		try {
			const result = await sdk.ask(question, {
				tenantId: tenId,
				database: body.database ?? databaseName,
				chartType: body.chartType ?? "vizspec",
				...(sessionIdForAsk ? { querypanelSessionId: sessionIdForAsk } : {}),
				...(typeof body.model === "string" && body.model.trim().length > 0
					? { model: body.model.trim() }
					: {}),
			});

			// Match querypanel-web generate-chart-with-sql response shape
			const vizSpec = result.chart?.vizSpec as { kind?: string; encoding?: Record<string, unknown> } | undefined;
			const vizSpecEncoding =
				vizSpec && vizSpec.kind === "chart" ? vizSpec.encoding : null;
			const enc = vizSpecEncoding as Record<string, unknown> | null;
			const chartType = (enc?.chartType as string | undefined) ?? "bar";
			const chartSpec = enc
				? {
						kind: "chart",
						title: question,
						description: question,
						data: result.rows ?? [],
						encoding: {
							chartType: (enc.chartType as string | undefined) ?? "bar",
							x: enc.x,
							y: enc.y,
							series: enc.series,
							stacking: enc.stacking,
							sort: enc.sort,
							limit: enc.limit,
							tooltips: enc.tooltips,
						},
					}
				: {
						kind: "chart",
						title: question,
						description: question,
						data: result.rows ?? [],
						encoding: {
							chartType: "bar",
							x: {
								field: result.fields?.[0] ?? "x",
								type: "nominal" as const,
							},
							y: {
								field: result.fields?.[1] ?? "y",
								type: "quantitative" as const,
							},
						},
					};
			const rationale =
				(result.chart as { rationale?: string } | undefined)?.rationale ??
				result.rationale ??
				`This ${chartType} chart visualizes the query results.`;
			const datasourceDisplayName = embed.metadata.name ?? "database";
			const resolvedParams =
				Object.keys(result.params ?? {}).length > 0
					? result.params
					: embed.dialect === "bigquery" &&
							  tenId &&
							  embed.metadata.tenantFieldName
						? { [embed.metadata.tenantFieldName]: tenId }
						: embed.dialect === "postgres" && /\$1\b/.test(result.sql) && tenId
							? { "1": tenId }
							: {};
			return c.json({
				message: `I've created a ${chartType} chart from your ${datasourceDisplayName} database.`,
				chartSpec,
				rationale,
				sql: result.sql,
				params: resolvedParams,
				tenantId: tenId,
				rowCount: result.rows?.length ?? 0,
				sessionId: result.querypanelSessionId,
			});
		} catch (error) {
			logger.error({ err: error }, "Embed generate-chart-with-sql failed");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ success: false, error: message, code: QueryErrorCode.INTERNAL_ERROR },
				500,
			);
		}
	});

	/**
	 * POST /query/run-sql
	 * Run provided SQL with tenant isolation and validation (no NL generation).
	 */
	app.post("/query/run-sql", async (c) => {
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

		let body: {
			sql: string;
			params?: Record<string, unknown>;
			database?: string;
			datasourceId?: string;
			datasourceIds?: string[];
		};
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{ success: false, error: "Invalid JSON body", code: QueryErrorCode.VALIDATION_ERROR },
				400,
			);
		}
		if (!body?.sql || typeof body.sql !== "string") {
			return c.json(
				{ success: false, error: "sql is required", code: QueryErrorCode.VALIDATION_ERROR },
				400,
			);
		}

		const embed = await datasourceService.getEmbedClient(auth, {
			datasourceId: body.datasourceId ?? body.datasourceIds?.[0],
		});
		if (!embed) {
			return c.json(
				{
					success: false,
					error:
						"No datasource available. Add a Postgres, ClickHouse, or BigQuery datasource for this organization.",
					code: QueryErrorCode.INTERNAL_ERROR,
				},
				503,
			);
		}

		try {
			const { execution } = await executeEmbeddedSql(auth, deps, {
				sql: body.sql,
				params: body.params ?? {},
				database: body.database,
				datasourceId: body.datasourceId ?? body.datasourceIds?.[0],
			});
			return c.json(execution);
		} catch (error) {
			logger.error({ err: error }, "Embed run-sql failed");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ success: false, error: message, code: QueryErrorCode.INTERNAL_ERROR },
				500,
			);
		}
	});
};
