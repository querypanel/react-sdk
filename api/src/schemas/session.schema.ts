import { z } from "zod";
import { paginationMetadataSchema } from "./saved-chart.schema";

/**
 * Session list query schema with pagination, filtering, and sorting.
 */
export const sessionListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
	sort_by: z
		.enum(["title", "user_id", "created_at", "updated_at"])
		.optional()
		.default("updated_at"),
	sort_dir: z.enum(["asc", "desc"]).optional().default("desc"),
	title: z.string().optional(),
	user_id: z.string().optional(),
	created_from: z.string().datetime().optional(),
	created_to: z.string().datetime().optional(),
	updated_from: z.string().datetime().optional(),
	updated_to: z.string().datetime().optional(),
});

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

/**
 * Session update request schema.
 */
export const updateSessionRequestSchema = z.object({
	title: z.string().min(1).optional(),
});

export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;

/**
 * Session get query schema.
 */
export const sessionGetQuerySchema = z.object({
	include_turns: z.coerce.boolean().optional().default(false),
});

export type SessionGetQuery = z.infer<typeof sessionGetQuerySchema>;

/**
 * Pagination metadata schema (re-export for session responses).
 */
export { paginationMetadataSchema };
