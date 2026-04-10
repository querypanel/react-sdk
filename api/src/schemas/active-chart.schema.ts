import { z } from "zod";

/**
 * Create active chart request schema
 */
export const createActiveChartRequestSchema = z.object({
	chart_id: z.string().uuid("Valid chart_id UUID is required"),
	order: z.number().int().optional(),
	meta: z.record(z.string(), z.any()).optional(),
});

export type CreateActiveChartRequest = z.infer<
	typeof createActiveChartRequestSchema
>;

/**
 * Update active chart request schema
 */
export const updateActiveChartRequestSchema = z.object({
	chart_id: z.string().uuid().optional(),
	order: z.number().int().optional(),
	meta: z.record(z.string(), z.any()).optional(),
});

export type UpdateActiveChartRequest = z.infer<
	typeof updateActiveChartRequestSchema
>;
