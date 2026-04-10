import { z } from "zod";

const tenantSettingsSchema = z.object({
	tenantFieldName: z.string(),
	tenantFieldType: z.string(),
	enforceTenantIsolation: z.boolean(),
});

export const queryRequestSchema = z
	.object({
		question: z.string().min(1, "Question is required"),
		session_id: z.string().optional(),
		last_error: z.string().optional(),
		previous_sql: z.string().optional(),
		max_retry: z.number().int().min(0).max(5).optional().default(3),
		tenant_settings: tenantSettingsSchema.optional(),
		database: z.string().optional(),
		dialect: z.string().optional(),
		/**
		 * Optional additional system prompt text for the v2 pipeline.
		 * The backend appends it to its built-in system prompts (SQL generation + reflection).
		 */
		system_prompt: z.string().min(1).max(8000).optional(),
		/** Optional OpenAI model id for SQL generation (v2 pipeline). Empty uses server config. */
		model: z.string().optional(),
	})
	.refine(
		(data) => {
			// If last_error is provided, previous_sql must also be provided
			if (data.last_error && !data.previous_sql) {
				return false;
			}
			return true;
		},
		{
			message: "previous_sql is required when last_error is provided",
			path: ["previous_sql"],
		},
	);

export type QueryRequest = z.infer<typeof queryRequestSchema>;
