import type { Hono } from "hono";
import { z } from "zod";
import {
	createActiveChartRequestSchema,
	updateActiveChartRequestSchema,
} from "../schemas/active-chart.schema";
import { chartsListQuerySchema } from "../schemas/saved-chart.schema";
import { ActiveChartService } from "../services/active-chart.service";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";

interface ActiveChartRouteDeps {
	activeChartService: ActiveChartService;
}

export const registerActiveChartRoutes = (
	app: Hono<any>,
	{ activeChartService }: ActiveChartRouteDeps,
) => {
	const logger = createLogger("active-chart-route");

	// Create active chart
	app.post("/active-charts", async (c) => {
		try {
			const body = await c.req.json();
			const validated = createActiveChartRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "organizationId is required" }, 400);
			}
			if (!auth?.tenantId) {
				return c.json({ error: "tenantId is required" }, 400);
			}

			logger.debug({ chart_id: validated.chart_id }, "Creating active chart");

			const activeChart = await activeChartService.createActiveChart(auth, {
				chart_id: validated.chart_id,
				order: validated.order,
				meta: validated.meta,
			});

			return c.json(activeChart, 201);
		} catch (error: any) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid request body",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to create active chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// List active charts (paginated)
	app.get("/active-charts", async (c) => {
		try {
			const queryParams = c.req.query();
			const validated = chartsListQuerySchema.parse(queryParams);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "organizationId is required" }, 400);
			}
			if (!auth?.tenantId) {
				return c.json({ error: "tenantId is required" }, 400);
			}

			logger.debug({ query: validated }, "Listing active charts");

			const result = await activeChartService.listActiveCharts(auth, validated);

			return c.json(result);
		} catch (error: any) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid query parameters",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to list active charts");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Get active chart by id
	app.get("/active-charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "organizationId is required" }, 400);
			}
			if (!auth?.tenantId) {
				return c.json({ error: "tenantId is required" }, 400);
			}

			logger.debug({ id }, "Getting active chart by ID");

			const activeChart = await activeChartService.getActiveChartById(auth, id);

			if (!activeChart) {
				return c.json({ error: "Active chart not found" }, 404);
			}

			return c.json(activeChart);
		} catch (error) {
			logger.error({ error }, "Failed to get active chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update active chart
	app.put("/active-charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const validated = updateActiveChartRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "organizationId is required" }, 400);
			}
			if (!auth?.tenantId) {
				return c.json({ error: "tenantId is required" }, 400);
			}

			logger.debug({ id, updates: validated }, "Updating active chart");

			const activeChart = await activeChartService.updateActiveChart(auth, id, {
				chart_id: validated.chart_id,
				order: validated.order,
				meta: validated.meta,
			});

			if (!activeChart) {
				return c.json({ error: "Active chart not found" }, 404);
			}

			return c.json(activeChart);
		} catch (error) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid request body",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to update active chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Delete active chart
	app.delete("/active-charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "organizationId is required" }, 400);
			}
			if (!auth?.tenantId) {
				return c.json({ error: "tenantId is required" }, 400);
			}

			logger.debug({ id }, "Deleting active chart");

			await activeChartService.deleteActiveChart(auth, id);

			return c.body(null, 204);
		} catch (error) {
			logger.error({ error }, "Failed to delete active chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});
};
