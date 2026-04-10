import { z } from "zod";

const columnSchema = z.object({
	name: z.string(),
	data_type: z.string(),
	is_primary_key: z.boolean(),
	description: z.string(),
});

const tableSchema = z.object({
	table_name: z.string(),
	description: z.string(),
	columns: z.array(columnSchema),
});

const tenantSettingsSchema = z.object({
	tenantFieldName: z.string(),
	tenantFieldType: z.string(),
	enforceTenantIsolation: z.boolean(),
});

export const ingestRequestSchema = z.object({
	database: z.string(),
	dialect: z.string(),
	tables: z.array(tableSchema),
	force_reindex: z.boolean().optional(),
	tenant_settings: tenantSettingsSchema.optional(),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
