import type { Hono } from "hono";
import { z } from "zod";
import {
	createDashboardRequestSchema,
	updateDashboardRequestSchema,
	updateDashboardStatusRequestSchema,
	dashboardsListQuerySchema,
} from "../schemas/dashboard.schema";
import type { AppContext } from "../types/app";
import type { DashboardService } from "../services/dashboard.service";
import type { DashboardForkService } from "../services/dashboard-fork.service";
import { createLogger } from "../lib/logger";

interface DashboardRouteDeps {
	dashboardService: DashboardService;
	dashboardForkService: DashboardForkService;
}

export const registerDashboardRoutes = (
	app: Hono<AppContext>,
	{
		dashboardService,
		dashboardForkService,
	}: DashboardRouteDeps,
) => {
	const logger = createLogger("dashboard-route");

	// ============================================================================
	// Dashboard Routes
	// ============================================================================

	// Create dashboard
	app.post("/dashboards", async (c) => {
		try {
			const body = await c.req.json();
			const validated = createDashboardRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ name: validated.name }, "Creating dashboard");

			const dashboard = await dashboardService.createDashboard(auth, {
				name: validated.name,
				description: validated.description,
				content_json: validated.content_json,
				admin_prompt: validated.admin_prompt,
				widget_config: validated.widget_config,
				editor_type: validated.editor_type,
				datasource_id: validated.datasource_id,
			});

			return c.json(dashboard, 201);
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
			logger.error({ error }, "Failed to create dashboard");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// List dashboards
	app.get("/dashboards", async (c) => {
		try {
			const queryParams = c.req.query();
			const validated = dashboardsListQuerySchema.parse(queryParams);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ query: validated }, "Listing dashboards");

			const result = await dashboardService.listDashboards(auth, validated);

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
			logger.error({ error }, "Failed to list dashboards");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Get dashboard by ID
	app.get("/dashboards/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id }, "Getting dashboard by ID");

			const dashboard = await dashboardService.getDashboardById(auth, id);

			if (!dashboard) {
				return c.json({ error: "Dashboard not found" }, 404);
			}

			return c.json(dashboard);
		} catch (error) {
			logger.error({ error }, "Failed to get dashboard");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update dashboard
	app.put("/dashboards/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const validated = updateDashboardRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id, updates: validated }, "Updating dashboard");

			const dashboard = await dashboardService.updateDashboard(auth, id, {
				name: validated.name,
				description: validated.description,
				content_json: validated.content_json,
				admin_prompt: validated.admin_prompt,
				widget_config: validated.widget_config,
				editor_type: validated.editor_type,
				datasource_id: validated.datasource_id,
				available_datasource_ids: validated.available_datasource_ids,
				tenant_field_name: validated.tenant_field_name,
				tenant_field_by_datasource: validated.tenant_field_by_datasource,
			});

			if (!dashboard) {
				return c.json({ error: "Dashboard not found" }, 404);
			}

			return c.json(dashboard);
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
			logger.error({ error }, "Failed to update dashboard");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update dashboard status
	app.patch("/dashboards/:id/status", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const validated = updateDashboardStatusRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id, status: validated.status }, "Updating dashboard status");

			const dashboard = await dashboardService.updateDashboardStatus(
				auth,
				id,
				validated.status,
			);

			if (!dashboard) {
				return c.json({ error: "Dashboard not found" }, 404);
			}

			return c.json(dashboard);
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
			logger.error({ error }, "Failed to update dashboard status");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Delete dashboard
	app.delete("/dashboards/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ id }, "Deleting dashboard");

			await dashboardService.deleteDashboard(auth, id);

			return c.body(null, 204);
		} catch (error) {
			logger.error({ error }, "Failed to delete dashboard");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// ============================================================================
	// Customer Fork Routes
	// ============================================================================

	// Get dashboard for tenant (returns fork if exists, otherwise original)
	app.get("/dashboards/:id/for-tenant", async (c) => {
		try {
			const id = c.req.param("id");
			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			logger.debug(
				{ id, tenantId: auth.tenantId },
				"Getting dashboard for tenant",
			);

			const dashboard = await dashboardForkService.getDashboardForTenant(
				auth,
				id,
				auth.tenantId,
			);

			if (!dashboard) {
				return c.json({ error: "Dashboard not found" }, 404);
			}

			return c.json(dashboard);
		} catch (error) {
			logger.error({ error }, "Failed to get dashboard for tenant");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Fork dashboard for customer customization
	app.post("/dashboards/:id/fork", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json().catch(() => ({}));
			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			const customName =
				typeof body?.name === "string" && body.name.trim().length > 0
					? body.name.trim()
					: undefined;
			logger.debug({ id, tenantId: auth.tenantId }, "Forking dashboard");

			const fork = await dashboardForkService.forkDashboard(
				auth,
				id,
				auth.tenantId,
				customName,
			);

			return c.json(fork, 201);
		} catch (error) {
			logger.error({ error }, "Failed to fork dashboard");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update customer fork
	app.put("/dashboards/forks/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const { content_json, widget_config } = body;

			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			logger.debug({ id, tenantId: auth.tenantId }, "Updating fork");

			const fork = await dashboardForkService.updateFork(auth, id, auth.tenantId, {
				content_json,
				widget_config,
			});

			if (!fork) {
				return c.json({ error: "Fork not found" }, 404);
			}

			return c.json(fork);
		} catch (error) {
			logger.error({ error }, "Failed to update fork");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Rollback fork to original
	app.post("/dashboards/forks/:id/rollback", async (c) => {
		try {
			const id = c.req.param("id");
			await c.req.json().catch(() => ({}));

			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			logger.debug({ id, tenantId: auth.tenantId }, "Rolling back fork");

			const original = await dashboardForkService.rollbackFork(
				auth,
				id,
				auth.tenantId,
			);

			return c.json(original);
		} catch (error) {
			logger.error({ error }, "Failed to rollback fork");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Delete customer fork
	app.delete("/dashboards/forks/:id", async (c) => {
		try {
			const id = c.req.param("id");

			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			logger.debug({ id, tenantId: auth.tenantId }, "Deleting fork");

			await dashboardForkService.deleteFork(auth, id, auth.tenantId);

			return c.body(null, 204);
		} catch (error) {
			logger.error({ error }, "Failed to delete fork");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// List customer forks for tenant
	app.get("/dashboards/customer/:tenantId", async (c) => {
		try {
			const auth = c.get("auth");

			if (!auth?.organizationId || !auth?.tenantId) {
				return c.json(
					{
						error: "Authentication required with organization_id and tenant_id",
					},
					401,
				);
			}

			logger.debug({ tenantId: auth.tenantId }, "Listing forks for tenant");

			const forks = await dashboardForkService.listForksForTenant(
				auth,
				auth.tenantId,
			);

			return c.json(forks);
		} catch (error) {
			logger.error({ error }, "Failed to list forks for tenant");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});
};
