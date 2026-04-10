import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";
import type {
	ActiveChartRecord,
	ActiveChartWithChart,
	ActiveChartInsertPayload,
	ActiveChartUpdatePayload,
} from "../types/active-chart";
import type {
	ChartsListQuery,
	PaginatedResponse,
} from "../schemas/saved-chart.schema";

const logger = createLogger("active-chart-service");

export class ActiveChartService {
	/**
	 * Create a new active chart
	 */
	async createActiveChart(
		auth: AuthContext,
		data: {
			chart_id: string;
			order?: number;
			meta?: Record<string, unknown>;
		},
	): Promise<ActiveChartRecord> {
		if (!auth.organizationId) {
			throw new Error("organizationId is required");
		}
		if (!auth.tenantId) {
			throw new Error("tenantId is required");
		}

		const insertPayload: ActiveChartInsertPayload = {
			organization_id: auth.organizationId,
			tenant_id: auth.tenantId,
			user_id: auth.userId ?? null,
			chart_id: data.chart_id,
			order: data.order ?? null,
			meta: data.meta ?? null,
		};

		logger.debug({ insertPayload }, "Creating active chart");

		const { data: activeChart, error } = await supabase
			.from("sdk_active_charts")
			.insert(insertPayload)
			.select()
			.single();

		if (error) {
			logger.error({ error }, "Failed to create active chart");
			throw new Error(`Failed to create active chart: ${error.message}`);
		}

		return activeChart as ActiveChartRecord;
	}

	/**
	 * List active charts with pagination, filtering, and sorting
	 */
	async listActiveCharts(
		auth: AuthContext,
		query: ChartsListQuery,
	): Promise<PaginatedResponse<ActiveChartWithChart>> {
		if (!auth.organizationId) {
			throw new Error("organizationId is required");
		}
		if (!auth.tenantId) {
			throw new Error("tenantId is required");
		}

		const {
			page,
			limit,
			sort_by,
			sort_dir,
			title,
			user_id,
			created_from,
			created_to,
			updated_from,
			updated_to,
		} = query;

		const offset = (page - 1) * limit;

		// Build base query
		let baseQuery = supabase
			.from("sdk_active_charts")
			.select("*, chart:sdk_charts(*)", { count: "exact" })
			.eq("organization_id", auth.organizationId)
			.eq("tenant_id", auth.tenantId);

		// Apply filters
		if (title) {
			// Filter by related chart title
			baseQuery = baseQuery.ilike("sdk_charts.title", `%${title}%`);
		}
		if (user_id) {
			baseQuery = baseQuery.eq("user_id", user_id);
		}
		if (created_from) {
			baseQuery = baseQuery.gte("sdk_charts.created_at", created_from);
		}
		if (created_to) {
			baseQuery = baseQuery.lte("sdk_charts.created_at", created_to);
		}
		if (updated_from) {
			baseQuery = baseQuery.gte("sdk_charts.updated_at", updated_from);
		}
		if (updated_to) {
			baseQuery = baseQuery.lte("sdk_charts.updated_at", updated_to);
		}

		// Get count
		const { count, error: countError } = await baseQuery;
		if (countError) {
			logger.error({ error: countError }, "Failed to count active charts");
			throw new Error(`Failed to count active charts: ${countError.message}`);
		}

		// Apply sorting and pagination
		const sortMap: Record<string, { column: string; foreignTable?: string }> = {
			title: { column: "title", foreignTable: "sdk_charts" },
			user_id: { column: "user_id" },
			created_at: { column: "created_at", foreignTable: "sdk_charts" },
			updated_at: { column: "updated_at", foreignTable: "sdk_charts" },
		};
		const mapping = sortMap[sort_by] ?? {
			column: "created_at",
			foreignTable: "sdk_charts",
		};
		const { column, foreignTable } = mapping;

		const { data, error } = await baseQuery
			.order(column, {
				ascending: sort_dir === "asc",
				...(foreignTable ? { foreignTable } : {}),
			})
			.range(offset, offset + limit - 1);

		if (error) {
			logger.error({ error }, "Failed to list active charts");
			throw new Error(`Failed to list active charts: ${error.message}`);
		}

		// Calculate pagination metadata
		const total = count || 0;
		const totalPages = Math.ceil(total / limit);
		const hasNext = page < totalPages;
		const hasPrev = page > 1;

		return {
			data: (data ?? []) as ActiveChartWithChart[],
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
	 * Get active chart by ID
	 */
	async getActiveChartById(
		auth: AuthContext,
		id: string,
	): Promise<ActiveChartWithChart | null> {
		if (!auth.organizationId) {
			throw new Error("organizationId is required");
		}
		if (!auth.tenantId) {
			throw new Error("tenantId is required");
		}

		const query = supabase
			.from("sdk_active_charts")
			.select("*, chart:sdk_charts(*)")
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.eq("tenant_id", auth.tenantId);

		const { data, error } = await query.single();

		if (error) {
			if ((error as any).code === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to get active chart");
			throw new Error(`Failed to get active chart: ${error.message}`);
		}

		return data as ActiveChartWithChart;
	}

	/**
	 * Update active chart by ID
	 */
	async updateActiveChart(
		auth: AuthContext,
		id: string,
		updates: {
			chart_id?: string;
			order?: number;
			meta?: Record<string, unknown>;
		},
	): Promise<ActiveChartRecord | null> {
		if (!auth.organizationId) {
			throw new Error("organizationId is required");
		}
		if (!auth.tenantId) {
			throw new Error("tenantId is required");
		}

		const updatePayload: ActiveChartUpdatePayload = {};

		if (updates.chart_id !== undefined)
			updatePayload.chart_id = updates.chart_id;
		if (updates.order !== undefined) updatePayload.order = updates.order;
		if (updates.meta !== undefined) updatePayload.meta = updates.meta;
		updatePayload.updated_at = new Date().toISOString();

		logger.debug({ id, updatePayload }, "Updating active chart");

		const query = supabase
			.from("sdk_active_charts")
			.update(updatePayload)
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.eq("tenant_id", auth.tenantId);

		const { data, error } = await query.select().single();

		if (error) {
			if ((error as any).code === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to update active chart");
			throw new Error(`Failed to update active chart: ${error.message}`);
		}

		return data as ActiveChartRecord;
	}

	/**
	 * Delete active chart by ID
	 */
	async deleteActiveChart(auth: AuthContext, id: string): Promise<boolean> {
		if (!auth.organizationId) {
			throw new Error("organizationId is required");
		}
		if (!auth.tenantId) {
			throw new Error("tenantId is required");
		}

		const query = supabase
			.from("sdk_active_charts")
			.delete()
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.eq("tenant_id", auth.tenantId);

		const { error } = await query;

		if (error) {
			logger.error({ error }, "Failed to delete active chart");
			throw new Error(`Failed to delete active chart: ${error.message}`);
		}

		return true;
	}
}
