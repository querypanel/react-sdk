import type { Hono } from "hono";
import { z } from "zod";
import {
	createChartRequestSchema,
	updateChartRequestSchema,
	chartsListQuerySchema,
} from "../schemas/saved-chart.schema";
import { SavedChartService } from "../services/saved-chart.service";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";

interface SavedChartRouteDeps {
	savedChartService: SavedChartService;
}

export const registerSavedChartRoutes = (
	app: Hono<any>,
	{ savedChartService }: SavedChartRouteDeps,
) => {
	const logger = createLogger("saved-chart-route");

	// Create chart
	app.post("/charts", async (c) => {
		try {
			const body = await c.req.json();
			const validated = createChartRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ title: validated.title }, "Creating chart");

			const chart = await savedChartService.createChart(auth, {
				title: validated.title,
				prompt: validated.prompt,
				description: validated.description,
				sql: validated.sql,
				sql_params: validated.sql_params,
				vega_lite_spec: validated.vega_lite_spec,
				spec_type: validated.spec_type,
				query_id: validated.query_id,
				database: validated.database,
				target_db: validated.target_db,
			});

			return c.json(chart, 201);
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
			logger.error({ error }, "Failed to create chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// List charts (paginated)
	app.get("/charts", async (c) => {
		try {
			const queryParams = c.req.query();
			const validated = chartsListQuerySchema.parse(queryParams);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ query: validated }, "Listing charts");

			const result = await savedChartService.listCharts(auth, validated);

			return c.json(result);
		} catch (error) {
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
			logger.error({ error }, "Failed to list charts");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Get chart by id
	app.get("/charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id }, "Getting chart by ID");

			const chart = await savedChartService.getChartById(auth, id);

			if (!chart) {
				return c.json({ error: "Chart not found" }, 404);
			}

			return c.json(chart);
		} catch (error) {
			logger.error({ error }, "Failed to get chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update chart
	app.put("/charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const validated = updateChartRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id, updates: validated }, "Updating chart");

			const chart = await savedChartService.updateChart(auth, id, {
				title: validated.title,
				prompt: validated.prompt,
				description: validated.description,
				sql: validated.sql,
				sql_params: validated.sql_params,
				vega_lite_spec: validated.vega_lite_spec,
				spec_type: validated.spec_type,
				database: validated.database,
				target_db: validated.target_db,
			});

			if (!chart) {
				return c.json({ error: "Chart not found" }, 404);
			}

			return c.json(chart);
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
			logger.error({ error }, "Failed to update chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Delete chart
	app.delete("/charts/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id }, "Deleting chart");

			await savedChartService.deleteChart(auth, id);

			return c.body(null, 204);
		} catch (error) {
			logger.error({ error }, "Failed to delete chart");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});
};
