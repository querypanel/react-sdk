import { z } from "zod";

export const knowledgeBaseAnnotationRequestSchema = z.object({
	organization_id: z.string().uuid(),
	tenant_id: z.string().optional(),
	target_identifier: z.string().min(1),
	content: z.string().min(1),
	user_id: z.string().min(1),
});

export const knowledgeBaseAnnotationResponseSchema = z.object({
	id: z.string().uuid(),
	organization_id: z.string().uuid(),
	target_identifier: z.string(),
	content: z.string(),
	created_by: z.string(),
	updated_by: z.string(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime(),
});

const goldSqlSchema = z.object({
	sql: z.string().min(1),
	description: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
});

const glossaryEntrySchema = z.object({
	term: z.string().min(1),
	definition: z.string().min(1),
});

const tableKnowledgeSchema = z
	.object({
		table_name: z.string().min(1),
		gold_sql: z.array(goldSqlSchema).optional(),
		glossary: z.array(glossaryEntrySchema).optional(),
	})
	.refine(
		(table) =>
			(table.gold_sql && table.gold_sql.length > 0) ||
			(table.glossary && table.glossary.length > 0),
		{
			message:
				"Each table must include at least one gold_sql or glossary entry",
		},
	);

export const knowledgeBaseChunkRequestSchema = z.object({
	organization_id: z.string().uuid(),
	tenant_id: z.string().optional(),
	database: z.string().min(1),
	dialect: z.string().min(1),
	tables: z.array(tableKnowledgeSchema).min(1),
});

export type KnowledgeBaseAnnotationRequest = z.infer<
	typeof knowledgeBaseAnnotationRequestSchema
>;
export type KnowledgeBaseAnnotationResponse = z.infer<
	typeof knowledgeBaseAnnotationResponseSchema
>;
export type KnowledgeBaseChunkRequest = z.infer<
	typeof knowledgeBaseChunkRequestSchema
>;
