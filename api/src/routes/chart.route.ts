import type { Hono } from "hono";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import { createLogger } from "../lib/logger";
import { chartRequestSchema } from "../schemas/chart.schema";
import type { AutoEvalService } from "../services/auto-eval.service";
import type { ChartGeneratorService } from "../services/chart-generator.service";
import { ChartValidationError } from "../services/chart-validator.service";
import type { SqlLogService } from "../services/sql-log.service";
import type { AppContext } from "../types/app";
import type { ChartGeneratorInput } from "../types/chart";

interface ChartRouteDeps {
	chartGenerator: ChartGeneratorService;
	sqlLogService: SqlLogService;
	autoEvalService: AutoEvalService;
}

export const registerChartRoutes = (
	app: Hono<AppContext>,
	{ chartGenerator, sqlLogService, autoEvalService }: ChartRouteDeps,
) => {
	const logger = createLogger("chart-route");

	app.post("/chart", async (c) => {
		const auth = c.get("auth");
		const sessionId = c.req.header("x-session-id") ?? undefined;

		// Validate auth context has required fields
		if (!auth.organizationId || !auth.tenantId) {
			return c.json(
				{ error: "Authentication required with organization_id and tenant_id" },
				401,
			);
		}

		try {
			const body = await c.req.json();
			logger.debug(
				{ body, organizationId: auth.organizationId },
				"Received chart request",
			);

			const validated = chartRequestSchema.parse(body);

			logger.debug(
				{
					question: validated.question,
					fieldCount: validated.fields.length,
					fields: validated.fields,
					maxRetries: validated.max_retries,
					hasQueryId: !!validated.query_id,
					hasEncodingHints: !!validated.encoding_hints,
				},
				"Request validated, starting chart generation",
			);

			// Create Langfuse callback for tracing
			const callback = createLangfuseCallback({
				organizationId: auth.organizationId,
				sessionId,
				tenantId: auth.tenantId,
				userId: auth.userId,
				operation: "chart_generation",
				tags: ["chart", "vega_lite"],
				metadata: {
					query_id: validated.query_id,
				},
			});

			const input: ChartGeneratorInput = {
				question: validated.question,
				sql: validated.sql,
				rationale: validated.rationale,
				fields: validated.fields,
				rows: validated.rows,
				maxRetries: validated.max_retries,
				queryId: validated.query_id,
				callbacks: callback ? [callback] : undefined,
				encodingHints: validated.encoding_hints,
			};

			const result = await chartGenerator.generateWithRetry(input);

			logger.info(
				{
					hasChart: !!result.chart,
					hasNotes: !!result.notes,
				},
				"Chart generated successfully",
			);

			// Async, sampled auto-eval (does not affect request latency)
			void autoEvalService.evaluateE2E({
				organizationId: auth.organizationId,
				tenantId: auth.tenantId,
				sessionId,
				queryId: validated.query_id,
				question: validated.question,
				sql: validated.sql,
				fields: validated.fields,
				schemaRows: validated.rows,
				vegaLiteSpec: (result.chart as Record<string, unknown> | null) ?? null,
				target: "chart",
			});

			// Update SQL log to SUCCESS if query_id is provided
			if (validated.query_id) {
				try {
					await sqlLogService.updateToSuccess(validated.query_id);
					logger.debug(
						{ queryId: validated.query_id },
						"Updated SQL log to SUCCESS",
					);
				} catch (logError) {
					// Log the error but don't fail the chart request
					logger.error(
						{ error: logError, queryId: validated.query_id },
						"Failed to update SQL log to SUCCESS",
					);
				}
			}

			return c.json(result);
		} catch (error) {
			// Handle chart validation errors
			if (error instanceof ChartValidationError) {
				logger.warn(
					{
						error: error.message,
						details: error.details,
					},
					"Chart validation failed",
				);
				return c.json(
					{
						error: error.message,
						validation: {
							details: error.details,
						},
					},
					400,
				);
			}

			// Handle other errors
			logger.error({ error }, "Chart generation failed with error");
			const message = error instanceof Error ? error.message : "Unknown error";
			const status = 500;
			return c.json(
				{
					error: message,
				},
				status,
			);
		}
	});
};
