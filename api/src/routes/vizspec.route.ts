import type { Hono } from "hono";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import { createLogger } from "../lib/logger";
import { vizspecRequestSchema } from "../schemas/vizspec.schema";
import type { AutoEvalService } from "../services/auto-eval.service";
import type { SqlLogService } from "../services/sql-log.service";
import {
	type VizSpecGeneratorService,
	VizSpecValidationError,
} from "../services/vizspec-generator.service";
import type { AppContext } from "../types/app";
import type { VizSpecGeneratorInput } from "../types/vizspec";
import { z, ZodError } from "zod";

interface VizSpecRouteDeps {
	vizspecGenerator: VizSpecGeneratorService;
	sqlLogService: SqlLogService;
	autoEvalService: AutoEvalService;
}

export const registerVizSpecRoutes = (
	app: Hono<AppContext>,
	{ vizspecGenerator, sqlLogService, autoEvalService }: VizSpecRouteDeps,
) => {
	const logger = createLogger("vizspec-route");

	app.post("/vizspec", async (c) => {
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
				"Received vizspec request",
			);

			const validated = vizspecRequestSchema.parse(body);

			logger.debug(
				{
					question: validated.question,
					fieldCount: validated.fields.length,
					fields: validated.fields,
					maxRetries: validated.max_retries,
					hasQueryId: !!validated.query_id,
					hasEncodingHints: !!validated.encoding_hints,
				},
				"Request validated, starting VizSpec generation",
			);

			// Create Langfuse callback for tracing
			const callback = createLangfuseCallback({
				organizationId: auth.organizationId,
				sessionId,
				tenantId: auth.tenantId,
				userId: auth.userId,
				operation: "vizspec_generation",
				tags: ["vizspec", "visualization"],
				metadata: {
					query_id: validated.query_id,
				},
			});

			const input: VizSpecGeneratorInput = {
				question: validated.question,
				sql: validated.sql,
				rationale: validated.rationale,
				fields: validated.fields,
				rows: validated.rows,
				maxRetries: validated.max_retries,
				queryId: validated.query_id,
				callbacks: callback ? [callback] : undefined,
				encodingHints: validated.encoding_hints,
				supportedChartTypes: validated.supported_chart_types,
			};

			const result = await vizspecGenerator.generateWithRetry(input);

			logger.info(
				{
					hasSpec: !!result.spec,
					specKind: result.spec.kind,
					hasNotes: !!result.notes,
				},
				"VizSpec generated successfully",
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
				vizSpec: (result.spec as unknown as Record<string, unknown>) ?? null,
				target: "vizspec",
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
					// Log the error but don't fail the vizspec request
					logger.error(
						{ error: logError, queryId: validated.query_id },
						"Failed to update SQL log to SUCCESS",
					);
				}
			}

			return c.json(result);
		} catch (error) {
			if (error instanceof ZodError) {
				return c.json(
					{
						error: "Invalid vizspec request",
						validation: error.flatten(),
					},
					400,
				);
			}

			// Handle VizSpec validation errors
			if (error instanceof VizSpecValidationError) {
				logger.warn(
					{
						error: error.message,
						details: error.details,
					},
					"VizSpec validation failed",
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
			logger.error({ error }, "VizSpec generation failed with error");
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
