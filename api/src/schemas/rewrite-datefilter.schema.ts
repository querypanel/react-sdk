import { z } from "zod";

const tenantSettingsSchema = z.object({
	tenantFieldName: z.string(),
	tenantFieldType: z.string(),
	enforceTenantIsolation: z.boolean(),
});

export const rewriteDatefilterRequestSchema = z.object({
	previous_sql: z.string().min(1, "previous_sql is required"),
	previous_params: z
		.array(z.record(z.string(), z.unknown()))
		.optional()
		.default([]),
	date_range: z.object({
		from: z.string().optional(),
		to: z.string().optional(),
	}),
	question: z.string().min(1, "question is required"),
	tenant_settings: tenantSettingsSchema.optional(),
	database: z.string().optional(),
	dialect: z.string().optional(),
	session_id: z.string().uuid().optional(),
});

export type RewriteDatefilterRequest = z.infer<typeof rewriteDatefilterRequestSchema>;
