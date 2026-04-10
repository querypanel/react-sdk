import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";
import type {
	Dashboard,
	DashboardsListQuery,
	PaginatedResponse,
} from "../schemas/dashboard.schema";

const logger = createLogger("dashboard-service");

type DashboardUpdatePayload = {
	updated_at: string;
	name?: string;
	description?: string | null;
	content_json?: string | null;
	widget_config?: Record<string, unknown>;
	editor_type?: "blocknote" | "custom";
	datasource_id?: string | null;
	status?: "draft" | "deployed";
	deployed_at?: string | null;
	available_datasource_ids?: string[] | null;
	tenant_field_name?: string | null;
	tenant_field_by_datasource?: Record<string, string> | null;
};

const getErrorCode = (error: unknown): string | undefined => {
	if (typeof error === "object" && error !== null && "code" in error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

export class DashboardService {
	/**
	 * Create a new dashboard
	 */
	async createDashboard(
		auth: AuthContext,
		data: {
			name: string;
			description?: string;
			content_json?: string;
			admin_prompt?: string;
			widget_config?: Record<string, unknown>;
			editor_type?: "blocknote" | "custom";
			datasource_id?: string;
		},
	): Promise<Dashboard> {
		if (!auth.organizationId) {
			throw new Error("Organization ID is required");
		}
		const insertPayload = {
			organization_id: auth.organizationId,
			name: data.name,
			description: data.description ?? null,
			content_json: data.content_json ?? data.admin_prompt ?? null,
			widget_config: data.widget_config ?? {},
			editor_type: data.editor_type ?? "blocknote",
			datasource_id: data.datasource_id ?? null,
			status: "draft" as const,
			version: 1,
			created_by: auth.userId ?? null,
		};

		logger.debug({ insertPayload }, "Creating dashboard");

		const { data: dashboard, error } = await supabase
			.from("dashboards")
			.insert(insertPayload)
			.select()
			.single();

		if (error) {
			logger.error({ error }, "Failed to create dashboard");
			throw new Error(`Failed to create dashboard: ${error.message}`);
		}

		return dashboard as Dashboard;
	}

	/**
	 * List dashboards with pagination and filtering
	 */
	async listDashboards(
		auth: AuthContext,
		query: DashboardsListQuery,
	): Promise<PaginatedResponse<Dashboard>> {
		const { page, limit, status, sort_by, sort_dir } = query;
		const offset = (page - 1) * limit;

		// Build base query
		let baseQuery = supabase
			.from("dashboards")
			.select("*", { count: "exact" })
			.eq("organization_id", auth.organizationId);

		// Apply filters
		if (status) {
			baseQuery = baseQuery.eq("status", status);
		}

		// Get count
		const { count, error: countError } = await baseQuery;
		if (countError) {
			logger.error({ error: countError }, "Failed to count dashboards");
			throw new Error(`Failed to count dashboards: ${countError.message}`);
		}

		// Apply sorting and pagination
		const sortMap: Record<string, string> = {
			name: "name",
			created_at: "created_at",
			updated_at: "updated_at",
			deployed_at: "deployed_at",
		};
		const sortColumn = sortMap[sort_by] ?? "created_at";

		const { data, error } = await baseQuery
			.order(sortColumn, { ascending: sort_dir === "asc" })
			.range(offset, offset + limit - 1);

		if (error) {
			logger.error({ error }, "Failed to list dashboards");
			throw new Error(`Failed to list dashboards: ${error.message}`);
		}

		// Calculate pagination metadata
		const total = count || 0;
		const totalPages = Math.ceil(total / limit);
		const hasNext = page < totalPages;
		const hasPrev = page > 1;

		return {
			data: (data ?? []) as Dashboard[],
			pagination: {
				page,
				limit,
				total,
				totalPages,
				hasNext,
				hasPrev,
			},
		};
	}

	/**
	 * Get dashboard by ID
	 */
	async getDashboardById(
		auth: AuthContext,
		id: string,
	): Promise<Dashboard | null> {
		// Get dashboard
		const { data: dashboard, error: dashboardError } = await supabase
			.from("dashboards")
			.select("*")
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.single();

		if (dashboardError) {
			if (getErrorCode(dashboardError) === "PGRST116") {
				return null;
			}
			logger.error({ error: dashboardError }, "Failed to get dashboard");
			throw new Error(`Failed to get dashboard: ${dashboardError.message}`);
		}

		return dashboard as Dashboard;
	}

	/**
	 * Update dashboard by ID
	 */
	async updateDashboard(
		auth: AuthContext,
		id: string,
		updates: {
			name?: string;
			description?: string;
			content_json?: string;
			admin_prompt?: string;
			widget_config?: Record<string, unknown>;
			editor_type?: "blocknote" | "custom";
			datasource_id?: string | null;
			available_datasource_ids?: string[] | null;
			tenant_field_name?: string | null;
			tenant_field_by_datasource?: Record<string, string> | null;
		},
	): Promise<Dashboard | null> {
		const updatePayload: DashboardUpdatePayload = {
			updated_at: new Date().toISOString(),
		};

		if (updates.name !== undefined) updatePayload.name = updates.name;
		if (updates.description !== undefined)
			updatePayload.description = updates.description;
		if (updates.content_json !== undefined)
			updatePayload.content_json = updates.content_json;
		if (updates.admin_prompt !== undefined)
			updatePayload.content_json = updates.admin_prompt;
		if (updates.widget_config !== undefined)
			updatePayload.widget_config = updates.widget_config;
		if (updates.editor_type !== undefined)
			updatePayload.editor_type = updates.editor_type;
		if (updates.datasource_id !== undefined)
			updatePayload.datasource_id = updates.datasource_id;
		if (updates.available_datasource_ids !== undefined)
			updatePayload.available_datasource_ids = updates.available_datasource_ids;
		if (updates.tenant_field_name !== undefined)
			updatePayload.tenant_field_name = updates.tenant_field_name;
		if (updates.tenant_field_by_datasource !== undefined)
			updatePayload.tenant_field_by_datasource = updates.tenant_field_by_datasource;

		logger.debug({ id, updatePayload }, "Updating dashboard");

		const { data, error } = await supabase
			.from("dashboards")
			.update(updatePayload)
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.select()
			.single();

		if (error) {
			if (getErrorCode(error) === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to update dashboard");
			throw new Error(`Failed to update dashboard: ${error.message}`);
		}

		return data as Dashboard;
	}

	/**
	 * Update dashboard status (deploy/undeploy)
	 */
	async updateDashboardStatus(
		auth: AuthContext,
		id: string,
		status: "draft" | "deployed",
	): Promise<Dashboard | null> {
		const updatePayload: DashboardUpdatePayload = {
			status,
			updated_at: new Date().toISOString(),
		};

		// Set deployed_at when deploying
		if (status === "deployed") {
			updatePayload.deployed_at = new Date().toISOString();
		} else {
			updatePayload.deployed_at = null;
		}

		logger.debug({ id, status }, "Updating dashboard status");

		const { data, error } = await supabase
			.from("dashboards")
			.update(updatePayload)
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.select()
			.single();

		if (error) {
			if (getErrorCode(error) === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to update dashboard status");
			throw new Error(
				`Failed to update dashboard status: ${error.message}`,
			);
		}

		return data as Dashboard;
	}

	/**
	 * Delete dashboard by ID
	 */
	async deleteDashboard(auth: AuthContext, id: string): Promise<boolean> {
		const { error } = await supabase
			.from("dashboards")
			.delete()
			.eq("id", id)
			.eq("organization_id", auth.organizationId);

		if (error) {
			logger.error({ error }, "Failed to delete dashboard");
			throw new Error(`Failed to delete dashboard: ${error.message}`);
		}

		return true;
	}
}
