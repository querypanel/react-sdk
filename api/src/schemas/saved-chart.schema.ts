import { z } from "zod";
import { vizSpecSchema } from "./vizspec.schema";

/**
 * Vega-Lite specification schema (simplified)
 */
const vegaLiteSpecSchema = z
	.object({
		$schema: z.string(),
		description: z.string().optional(),
		data: z
			.object({
				values: z.array(z.record(z.string(), z.any())).optional(),
				name: z.string().optional(),
			})
			.optional(),
		mark: z.union([
			z.string(),
			z
				.object({
					type: z.string(),
				})
				.passthrough(),
		]),
		encoding: z.record(
			z.string(),
			z.union([
				z
					.object({
						field: z.string().optional(),
						type: z
							.enum(["quantitative", "temporal", "ordinal", "nominal"])
							.optional(),
						aggregate: z.string().optional(),
						title: z.string().optional(),
					})
					.passthrough(),
				z.array(z.any()),
			]),
		),
		title: z
			.union([
				z.string(),
				z
					.object({
						text: z.string(),
					})
					.passthrough(),
			])
			.optional(),
		width: z.union([z.number(), z.literal("container")]).optional(),
		height: z.union([z.number(), z.literal("container")]).optional(),
		config: z.record(z.string(), z.any()).optional(),
	})
	.passthrough();

/**
 * Combined spec schema that accepts either Vega-Lite or VizSpec format
 */
const chartSpecSchema = z.union([vegaLiteSpecSchema, vizSpecSchema]);

/**
 * Create chart request schema
 */
export const createChartRequestSchema = z.object({
	title: z.string().min(1, "Title is required"),
	prompt: z.string().optional(),
	description: z.string().optional(),
	sql: z.string().min(1, "SQL query is required"),
	sql_params: z.record(z.string(), z.any()).optional(),
	vega_lite_spec: chartSpecSchema,
	spec_type: z.enum(['vega-lite', 'vizspec']).optional(),
	query_id: z.string().uuid().optional(),
	database: z.string().optional(),
	target_db: z.string().optional(),
});

export type CreateChartRequest = z.infer<typeof createChartRequestSchema>;

/**
 * Update chart request schema
 */
export const updateChartRequestSchema = z.object({
	title: z.string().min(1).optional(),
	prompt: z.string().optional(),
	description: z.string().optional(),
	sql: z.string().min(1).optional(),
	sql_params: z.record(z.string(), z.any()).optional(),
	vega_lite_spec: chartSpecSchema.optional(),
	spec_type: z.enum(['vega-lite', 'vizspec']).optional(),
	database: z.string().optional(),
	target_db: z.string().optional(),
});

export type UpdateChartRequest = z.infer<typeof updateChartRequestSchema>;

/**
 * Charts list query schema with pagination, filtering, and sorting
 */
export const chartsListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
	sort_by: z
		.enum(["title", "user_id", "created_at", "updated_at"])
		.optional()
		.default("created_at"),
	sort_dir: z.enum(["asc", "desc"]).optional().default("desc"),
	title: z.string().optional(),
	user_id: z.string().optional(),
	created_from: z.string().datetime().optional(),
	created_to: z.string().datetime().optional(),
	updated_from: z.string().datetime().optional(),
	updated_to: z.string().datetime().optional(),
});

export type ChartsListQuery = z.infer<typeof chartsListQuerySchema>;

/**
 * Pagination metadata schema
 */
export const paginationMetadataSchema = z.object({
	page: z.number().int(),
	limit: z.number().int(),
	total: z.number().int(),
	totalPages: z.number().int(),
	hasNext: z.boolean(),
	hasPrev: z.boolean(),
});

export type PaginationMetadata = z.infer<typeof paginationMetadataSchema>;

/**
 * Paginated response schema (generic)
 */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(
	dataSchema: T,
) =>
	z.object({
		data: z.array(dataSchema),
		pagination: paginationMetadataSchema,
	});

export type PaginatedResponse<T> = {
	data: T[];
	pagination: PaginationMetadata;
};
