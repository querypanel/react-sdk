import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";
import type {
	ChartRecord,
	ChartWithActive,
	ChartInsertPayload,
	ChartUpdatePayload,
} from "../types/saved-chart";
import type {
	ChartsListQuery,
	PaginatedResponse,
} from "../schemas/saved-chart.schema";

const logger = createLogger("saved-chart-service");

export class SavedChartService {
	/**
	 * Create a new chart
	 */
	async createChart(
		auth: AuthContext,
		data: {
			title: string;
			prompt?: string;
			description?: string;
			sql: string;
			sql_params?: Record<string, unknown>;
			vega_lite_spec: Record<string, unknown>;
			spec_type?: 'vega-lite' | 'vizspec';
			query_id?: string;
			database?: string;
			target_db?: string;
		},
	): Promise<ChartRecord> {
		const insertPayload: ChartInsertPayload = {
			organization_id: auth.organizationId!,
			tenant_id: auth.tenantId ?? null,
			user_id: auth.userId ?? null,
			title: data.title,
			prompt: data.prompt ?? null,
			description: data.description ?? null,
			sql: data.sql,
			sql_params: data.sql_params ?? null,
			vega_lite_spec: data.vega_lite_spec,
			spec_type: data.spec_type,
			query_id: data.query_id ?? null,
			target_db: data.target_db ?? data.database ?? null,
		};

		logger.debug({ insertPayload }, "Creating chart");

		const { data: chart, error } = await supabase
			.from("sdk_charts")
			.insert(insertPayload)
			.select()
			.single();

		if (error) {
			logger.error({ error }, "Failed to create chart");
			throw new Error(`Failed to create chart: ${error.message}`);
		}

		return chart as ChartRecord;
	}

	/**
	 * List charts with pagination, filtering, and sorting
	 */
	async listCharts(
		auth: AuthContext,
		query: ChartsListQuery,
	): Promise<PaginatedResponse<ChartWithActive>> {
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
			.from("sdk_charts")
			.select("*, sdk_active_charts(id)", { count: "exact" })
			.eq("organization_id", auth.organizationId)
			.eq("sdk_active_charts.organization_id", auth.organizationId)
			.eq("sdk_active_charts.tenant_id", auth.tenantId ?? "");

		if (auth.tenantId) {
			baseQuery = baseQuery.eq("tenant_id", auth.tenantId);
		}

		// Apply filters
		if (title) {
			baseQuery = baseQuery.ilike("title", `%${title}%`);
		}
		if (user_id) {
			baseQuery = baseQuery.eq("user_id", user_id);
		}
		if (created_from) {
			baseQuery = baseQuery.gte("created_at", created_from);
		}
		if (created_to) {
			baseQuery = baseQuery.lte("created_at", created_to);
		}
		if (updated_from) {
			baseQuery = baseQuery.gte("updated_at", updated_from);
		}
		if (updated_to) {
			baseQuery = baseQuery.lte("updated_at", updated_to);
		}

		// Get count
		const { count, error: countError } = await baseQuery;
		if (countError) {
			logger.error({ error: countError }, "Failed to count charts");
			throw new Error(`Failed to count charts: ${countError.message}`);
		}

		// Apply sorting and pagination
		const sortMap: Record<string, string> = {
			title: "title",
			user_id: "user_id",
			created_at: "created_at",
			updated_at: "updated_at",
		};
		const sortColumn = sortMap[sort_by] ?? "created_at";

		const { data, error } = await baseQuery
			.order(sortColumn, { ascending: sort_dir === "asc" })
			.range(offset, offset + limit - 1);

		if (error) {
			logger.error({ error }, "Failed to list charts");
			throw new Error(`Failed to list charts: ${error.message}`);
		}

		// Calculate pagination metadata
		const total = count || 0;
		const totalPages = Math.ceil(total / limit);
		const hasNext = page < totalPages;
		const hasPrev = page > 1;

		// Add active flag
		const withActive = (data ?? []).map((row: any) => ({
			...row,
			active:
				Array.isArray(row.sdk_active_charts) &&
				row.sdk_active_charts.length > 0,
		})) as ChartWithActive[];

		return {
			data: withActive,
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
	 * Get chart by ID
	 */
	async getChartById(
		auth: AuthContext,
		id: string,
	): Promise<ChartWithActive | null> {
		let query = supabase
			.from("sdk_charts")
			.select("*, sdk_active_charts(id)")
			.eq("id", id)
			.eq("organization_id", auth.organizationId)
			.eq("sdk_active_charts.organization_id", auth.organizationId)
			.eq("sdk_active_charts.tenant_id", auth.tenantId ?? "");

		if (auth.tenantId) {
			query = query.eq("tenant_id", auth.tenantId);
		}

		if (auth.userId) {
			query = query.eq("user_id", auth.userId);
		}

		const { data, error } = await query.single();

		if (error) {
			if ((error as any).code === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to get chart");
			throw new Error(`Failed to get chart: ${error.message}`);
		}

		const withActive = {
			...(data as any),
			active:
				Array.isArray((data as any).sdk_active_charts) &&
				(data as any).sdk_active_charts.length > 0,
		} as ChartWithActive;

		return withActive;
	}

	/**
	 * Update chart by ID
	 */
	async updateChart(
		auth: AuthContext,
		id: string,
		updates: {
			title?: string;
			prompt?: string;
			description?: string;
			sql?: string;
			sql_params?: Record<string, unknown>;
			vega_lite_spec?: Record<string, unknown>;
			spec_type?: 'vega-lite' | 'vizspec';
			database?: string;
			target_db?: string;
		},
	): Promise<ChartRecord | null> {
		const updatePayload: ChartUpdatePayload = {};

		if (updates.title !== undefined) updatePayload.title = updates.title;
		if (updates.prompt !== undefined)
			updatePayload.prompt = updates.prompt;
		if (updates.description !== undefined)
			updatePayload.description = updates.description;
		if (updates.sql !== undefined) updatePayload.sql = updates.sql;
		if (updates.sql_params !== undefined)
			updatePayload.sql_params = updates.sql_params;
		if (updates.vega_lite_spec !== undefined)
			updatePayload.vega_lite_spec = updates.vega_lite_spec;
		if (updates.spec_type !== undefined)
			updatePayload.spec_type = updates.spec_type;
		if (updates.target_db !== undefined)
			updatePayload.target_db = updates.target_db;
		else if (updates.database !== undefined)
			updatePayload.target_db = updates.database;
		updatePayload.updated_at = new Date().toISOString();

		logger.debug({ id, updatePayload }, "Updating chart");

		let query = supabase
			.from("sdk_charts")
			.update(updatePayload)
			.eq("id", id)
			.eq("organization_id", auth.organizationId);

		if (auth.tenantId) {
			query = query.eq("tenant_id", auth.tenantId);
		}

		if (auth.userId) {
			query = query.eq("user_id", auth.userId);
		}

		const { data, error } = await query.select().single();

		if (error) {
			if ((error as any).code === "PGRST116") {
				return null;
			}
			logger.error({ error }, "Failed to update chart");
			throw new Error(`Failed to update chart: ${error.message}`);
		}

		return data as ChartRecord;
	}

	/**
	 * Delete chart by ID
	 */
	async deleteChart(auth: AuthContext, id: string): Promise<boolean> {
		let query = supabase
			.from("sdk_charts")
			.delete()
			.eq("id", id)
			.eq("organization_id", auth.organizationId);

		if (auth.tenantId) {
			query = query.eq("tenant_id", auth.tenantId);
		}

		if (auth.userId) {
			query = query.eq("user_id", auth.userId);
		}

		const { error } = await query;

		if (error) {
			logger.error({ error }, "Failed to delete chart");
			throw new Error(`Failed to delete chart: ${error.message}`);
		}

		return true;
	}
}
