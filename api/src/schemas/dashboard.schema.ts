import { z } from "zod";

/**
 * Dashboard schema
 */
export const dashboardSchema = z.object({
	id: z.string().uuid(),
	organization_id: z.string().uuid(),
	name: z.string(),
	description: z.string().nullable(),
	status: z.enum(["draft", "deployed"]),
	content_json: z.string().nullable(), // BlockNote content as JSON string
	widget_config: z.record(z.any()).nullable(), // Configuration for widgets
	editor_type: z.enum(["blocknote", "custom"]).default("blocknote"),
	// Customer fork tracking
	is_customer_fork: z.boolean().default(false),
	forked_from_dashboard_id: z.string().uuid().nullable(),
	tenant_id: z.string().nullable(),
	// Metadata
	datasource_id: z.string().uuid().nullable(),
	version: z.number().int(),
	deployed_at: z.string().datetime().nullable(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime(),
	created_by: z.string().nullable(),
	// Dashboard-level datasource and tenant config for customer embed
	available_datasource_ids: z.array(z.string().uuid()).nullable().optional(),
	tenant_field_name: z.string().nullable().optional(),
	tenant_field_by_datasource: z.record(z.string(), z.string()).nullable().optional(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

/**
 * Create dashboard request schema
 */
export const createDashboardRequestSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	content_json: z.string().optional(), // BlockNote content
	widget_config: z.record(z.any()).optional(),
	editor_type: z.enum(["blocknote", "custom"]).optional().default("blocknote"),
	admin_prompt: z.string().optional(), // Deprecated alias for content_json
	datasource_id: z.string().uuid().optional(),
});

export type CreateDashboardRequest = z.infer<
	typeof createDashboardRequestSchema
>;

/**
 * Update dashboard request schema
 */
export const updateDashboardRequestSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	content_json: z.string().optional(), // BlockNote content
	widget_config: z.record(z.any()).optional(),
	admin_prompt: z.string().optional(), // Deprecated alias for content_json
	editor_type: z.enum(["blocknote", "custom"]).optional(),
	datasource_id: z.string().uuid().nullable().optional(),
	available_datasource_ids: z.array(z.string().uuid()).nullable().optional(),
	tenant_field_name: z.string().nullable().optional(),
	tenant_field_by_datasource: z.record(z.string(), z.string()).nullable().optional(),
});

export type UpdateDashboardRequest = z.infer<
	typeof updateDashboardRequestSchema
>;

/**
 * Update dashboard status request schema
 */
export const updateDashboardStatusRequestSchema = z.object({
	status: z.enum(["draft", "deployed"]),
});

export type UpdateDashboardStatusRequest = z.infer<
	typeof updateDashboardStatusRequestSchema
>;

/**
 * Dashboards list query schema
 */
export const dashboardsListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
	status: z.enum(["draft", "deployed"]).optional(),
	sort_by: z
		.enum(["name", "created_at", "updated_at", "deployed_at"])
		.optional()
		.default("created_at"),
	sort_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type DashboardsListQuery = z.infer<typeof dashboardsListQuerySchema>;

/**
 * Pagination metadata (reused from saved-chart)
 */
export type PaginationMetadata = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
};

/**
 * Paginated response (generic)
 */
export type PaginatedResponse<T> = {
	data: T[];
	pagination: PaginationMetadata;
};

/**
 * Fork dashboard request schema
 */
export const forkDashboardRequestSchema = z.object({
	tenant_id: z.string().min(1, "Tenant ID is required"),
	name: z.string().optional(), // Optional custom name for fork
});

export type ForkDashboardRequest = z.infer<typeof forkDashboardRequestSchema>;

/**
 * Get dashboard for tenant query schema
 */
export const getDashboardForTenantQuerySchema = z.object({
	tenant_id: z.string().optional(),
});

export type GetDashboardForTenantQuery = z.infer<
	typeof getDashboardForTenantQuerySchema
>;
