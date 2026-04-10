import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";
import type { Dashboard } from "../schemas/dashboard.schema";

const logger = createLogger("dashboard-fork-service");

const getErrorCode = (error: unknown): string | undefined => {
	if (typeof error === "object" && error !== null && "code" in error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

export class DashboardForkService {
	/**
	 * Get dashboard for tenant - returns fork if exists, otherwise original
	 */
	async getDashboardForTenant(
		auth: AuthContext,
		dashboardId: string,
		tenantId?: string,
	): Promise<Dashboard | null> {
		// If no tenant_id provided, just return the original dashboard
		if (!tenantId) {
			const { data: dashboard, error } = await supabase
				.from("dashboards")
				.select("*")
				.eq("id", dashboardId)
				.eq("organization_id", auth.organizationId)
				.eq("is_customer_fork", false)
				.single();

			if (error) {
				if (getErrorCode(error) === "PGRST116") {
					return null;
				}
				logger.error({ error }, "Failed to get dashboard");
				throw new Error(`Failed to get dashboard: ${error.message}`);
			}

			return dashboard as Dashboard;
		}

		// Check if customer fork exists for this tenant
		const { data: fork, error: forkError } = await supabase
			.from("dashboards")
			.select("*")
			.eq("organization_id", auth.organizationId)
			.eq("forked_from_dashboard_id", dashboardId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.maybeSingle();

		if (forkError && getErrorCode(forkError) !== "PGRST116") {
			logger.error({ error: forkError }, "Failed to check for fork");
			throw new Error(`Failed to check for fork: ${forkError.message}`);
		}

		// If fork exists, overlay original's datasource/tenant config so forks receive admin updates
		if (fork) {
			const { data: original, error: origError } = await supabase
				.from("dashboards")
				.select("available_datasource_ids, tenant_field_name, tenant_field_by_datasource")
				.eq("id", dashboardId)
				.eq("organization_id", auth.organizationId)
				.eq("is_customer_fork", false)
				.single();

			if (!origError && original) {
				const merged: Dashboard = {
					...(fork as Dashboard),
					available_datasource_ids: original.available_datasource_ids,
					tenant_field_name: original.tenant_field_name,
					tenant_field_by_datasource: original.tenant_field_by_datasource,
				};
				logger.debug({ forkId: fork.id, tenantId }, "Returning customer fork with original datasource/tenant config");
				return merged;
			}
			logger.debug({ forkId: fork.id, tenantId }, "Returning customer fork");
			return fork as Dashboard;
		}

		// Otherwise, return the original dashboard
		const { data: dashboard, error } = await supabase
			.from("dashboards")
			.select("*")
			.eq("id", dashboardId)
			.eq("organization_id", auth.organizationId)
			.eq("is_customer_fork", false)
			.single();

		if (error) {
			if (getErrorCode(error) === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to get dashboard");
			throw new Error(`Failed to get dashboard: ${error.message}`);
		}

		return dashboard as Dashboard;
	}

	/**
	 * Fork a dashboard for customer customization (copy-on-write)
	 */
	async forkDashboard(
		auth: AuthContext,
		dashboardId: string,
		tenantId: string,
		customName?: string,
	): Promise<Dashboard> {
		if (!auth.organizationId) {
			throw new Error("Organization ID is required");
		}

		// Get the original dashboard
		const { data: originalDashboard, error: getError } = await supabase
			.from("dashboards")
			.select("*")
			.eq("id", dashboardId)
			.eq("organization_id", auth.organizationId)
			.eq("is_customer_fork", false)
			.single();

		if (getError) {
			if (getErrorCode(getError) === "PGRST116") {
				throw new Error("Dashboard not found");
			}
			logger.error({ error: getError }, "Failed to get original dashboard");
			throw new Error(`Failed to get original dashboard: ${getError.message}`);
		}

		// Check if dashboard is deployed
		if (originalDashboard.status !== "deployed") {
			throw new Error("Can only fork deployed dashboards");
		}

		// Check if fork already exists
		const { data: existingFork, error: checkError } = await supabase
			.from("dashboards")
			.select("id")
			.eq("organization_id", auth.organizationId)
			.eq("forked_from_dashboard_id", dashboardId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.maybeSingle();

		if (checkError && getErrorCode(checkError) !== "PGRST116") {
			logger.error({ error: checkError }, "Failed to check for existing fork");
			throw new Error(
				`Failed to check for existing fork: ${checkError.message}`,
			);
		}

		if (existingFork) {
			throw new Error("Fork already exists for this tenant");
		}

		// Create the fork (copy all content and dashboard config)
		const forkPayload = {
			organization_id: auth.organizationId,
			name: customName || `${originalDashboard.name} (${tenantId})`,
			description: originalDashboard.description,
			status: "deployed" as const, // Forks are automatically deployed
			content_json: originalDashboard.content_json,
			widget_config: originalDashboard.widget_config || {},
			editor_type: originalDashboard.editor_type || "blocknote",
			datasource_id: originalDashboard.datasource_id,
			available_datasource_ids: originalDashboard.available_datasource_ids ?? null,
			tenant_field_name: originalDashboard.tenant_field_name ?? null,
			tenant_field_by_datasource: originalDashboard.tenant_field_by_datasource ?? null,
			is_customer_fork: true,
			forked_from_dashboard_id: dashboardId,
			tenant_id: tenantId,
			version: 1,
			deployed_at: new Date().toISOString(),
			created_by: auth.userId ?? null,
		};

		logger.debug(
			{ dashboardId, tenantId, forkPayload },
			"Creating customer fork",
		);

		const { data: fork, error: forkError } = await supabase
			.from("dashboards")
			.insert(forkPayload)
			.select()
			.single();

		if (forkError) {
			logger.error({ error: forkError }, "Failed to create fork");
			throw new Error(`Failed to create fork: ${forkError.message}`);
		}

		return fork as Dashboard;
	}

	/**
	 * Update a customer fork
	 */
	async updateFork(
		auth: AuthContext,
		forkId: string,
		tenantId: string,
		updates: {
			content_json?: string;
			widget_config?: Record<string, unknown>;
		},
	): Promise<Dashboard | null> {
		const updatePayload: {
			updated_at: string;
			content_json?: string;
			widget_config?: Record<string, unknown>;
		} = {
			updated_at: new Date().toISOString(),
		};

		if (updates.content_json !== undefined) {
			updatePayload.content_json = updates.content_json;
		}
		if (updates.widget_config !== undefined) {
			updatePayload.widget_config = updates.widget_config;
		}

		logger.debug({ forkId, tenantId, updates }, "Updating fork");

		const { data, error } = await supabase
			.from("dashboards")
			.update(updatePayload)
			.eq("id", forkId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.eq("organization_id", auth.organizationId)
			.select()
			.single();

		if (error) {
			if (getErrorCode(error) === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to update fork");
			throw new Error(`Failed to update fork: ${error.message}`);
		}

		return data as Dashboard;
	}

	/**
	 * Rollback fork to original version (or delete fork)
	 */
	async rollbackFork(
		auth: AuthContext,
		forkId: string,
		tenantId: string,
	): Promise<Dashboard> {
		// Get the fork to find the original dashboard
		const { data: fork, error: getForkError } = await supabase
			.from("dashboards")
			.select("*")
			.eq("id", forkId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.eq("organization_id", auth.organizationId)
			.single();

		if (getForkError) {
			if (getErrorCode(getForkError) === "PGRST116") {
				throw new Error("Fork not found");
			}
			logger.error({ error: getForkError }, "Failed to get fork");
			throw new Error(`Failed to get fork: ${getForkError.message}`);
		}

		if (!fork.forked_from_dashboard_id) {
			throw new Error("Fork has no original dashboard reference");
		}

		// Get the original dashboard
		const { data: original, error: getOriginalError } = await supabase
			.from("dashboards")
			.select("*")
			.eq("id", fork.forked_from_dashboard_id)
			.eq("organization_id", auth.organizationId)
			.single();

		if (getOriginalError) {
			if (getErrorCode(getOriginalError) === "PGRST116") {
				throw new Error("Original dashboard not found");
			}
			logger.error({ error: getOriginalError }, "Failed to get original");
			throw new Error(
				`Failed to get original dashboard: ${getOriginalError.message}`,
			);
		}

		// Delete the fork (customer will see original again)
		const { error: deleteError } = await supabase
			.from("dashboards")
			.delete()
			.eq("id", forkId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.eq("organization_id", auth.organizationId);

		if (deleteError) {
			logger.error({ error: deleteError }, "Failed to delete fork");
			throw new Error(`Failed to delete fork: ${deleteError.message}`);
		}

		logger.debug({ forkId, tenantId }, "Fork rolled back to original");

		return original as Dashboard;
	}

	/**
	 * Delete a customer fork
	 */
	async deleteFork(
		auth: AuthContext,
		forkId: string,
		tenantId: string,
	): Promise<boolean> {
		const { error } = await supabase
			.from("dashboards")
			.delete()
			.eq("id", forkId)
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.eq("organization_id", auth.organizationId);

		if (error) {
			logger.error({ error }, "Failed to delete fork");
			throw new Error(`Failed to delete fork: ${error.message}`);
		}

		return true;
	}

	/**
	 * List customer forks for a tenant
	 */
	async listForksForTenant(
		auth: AuthContext,
		tenantId: string,
	): Promise<Dashboard[]> {
		const { data, error } = await supabase
			.from("dashboards")
			.select("*")
			.eq("tenant_id", tenantId)
			.eq("is_customer_fork", true)
			.eq("organization_id", auth.organizationId)
			.order("created_at", { ascending: false });

		if (error) {
			logger.error({ error }, "Failed to list forks for tenant");
			throw new Error(`Failed to list forks for tenant: ${error.message}`);
		}

		return (data ?? []) as Dashboard[];
	}
}
