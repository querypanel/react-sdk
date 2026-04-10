import type { Hono } from "hono";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import {
	knowledgeBaseAnnotationRequestSchema,
	knowledgeBaseChunkRequestSchema,
} from "../schemas/knowledge-base.schema";
import type { EmbeddingService } from "../services/embedding.service";
import type { KnowledgeBaseService } from "../services/knowledge-base.service";
import type { KnowledgeChunkService } from "../services/knowledge-chunk.service";
import type { AppContext } from "../types/app";

interface KnowledgeBaseRouteDeps {
	knowledgeBaseService: KnowledgeBaseService;
	embeddingService: EmbeddingService;
	knowledgeChunkService: KnowledgeChunkService;
}

export const registerKnowledgeBaseRoutes = (
	app: Hono<AppContext>,
	{
		knowledgeBaseService,
		embeddingService,
		knowledgeChunkService,
	}: KnowledgeBaseRouteDeps,
) => {
	app.post("/knowledge-base/annotations", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId) {
			return c.json(
				{ error: "Authentication required with organization_id" },
				401,
			);
		}

		try {
			const body = await c.req.json();
			const validatedData = knowledgeBaseAnnotationRequestSchema.parse(body);

			// Override organization_id from auth context
			const dataWithAuth = {
				...validatedData,
				organization_id: auth.organizationId,
			};

			const annotation = await knowledgeBaseService.upsert(dataWithAuth);

			return c.json({
				success: true,
				message: "Knowledge base annotation created/updated successfully",
				annotation,
			});
		} catch (error) {
			console.error("Error creating/updating annotation:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	});

	app.get("/knowledge-base/annotations", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId) {
			return c.json(
				{ error: "Authentication required with organization_id" },
				401,
			);
		}

		try {
			const annotations = await knowledgeBaseService.findByOrganization(
				auth.organizationId,
			);

			return c.json({
				success: true,
				annotations,
				count: annotations.length,
			});
		} catch (error) {
			console.error("Error fetching knowledge base annotations:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	});

	app.get("/knowledge-base/annotations/:target_identifier", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId) {
			return c.json(
				{ error: "Authentication required with organization_id" },
				401,
			);
		}

		try {
			const targetIdentifier = c.req.param("target_identifier");

			const annotation = await knowledgeBaseService.findByTargetIdentifier(
				auth.organizationId,
				targetIdentifier,
			);

			if (!annotation) {
				return c.json(
					{
						success: false,
						error: "Knowledge base annotation not found",
					},
					404,
				);
			}

			return c.json({
				success: true,
				annotation,
			});
		} catch (error) {
			console.error("Error fetching knowledge base annotation:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	});

	app.delete("/knowledge-base/annotations/:target_identifier", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId) {
			return c.json(
				{ error: "Authentication required with organization_id" },
				401,
			);
		}

		try {
			const targetIdentifier = c.req.param("target_identifier");

			await knowledgeBaseService.delete(auth.organizationId, targetIdentifier);

			return c.json({
				success: true,
				message: "Knowledge base annotation deleted successfully",
			});
		} catch (error) {
			console.error("Error deleting knowledge base annotation:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	});

	app.post("/knowledge-base/chunks", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId) {
			return c.json(
				{ error: "Authentication required with organization_id" },
				401,
			);
		}

		try {
			const body = await c.req.json();
			const validatedData = knowledgeBaseChunkRequestSchema.parse(body);

			// Override organization_id from auth context
			const dataWithAuth = {
				...validatedData,
				organization_id: auth.organizationId,
			};

			const { documents, counts } =
				knowledgeChunkService.buildDocuments(dataWithAuth);

			if (documents.length === 0) {
				return c.json(
					{
						success: false,
						error: "No knowledge base chunks to store",
					},
					400,
				);
			}

			const targetIdentifiers = documents
				.map((doc) => doc.metadata.target_identifier)
				.filter((id): id is string => typeof id === "string");

			const annotations = await knowledgeBaseService.findByTargetIdentifiers(
				auth.organizationId,
				targetIdentifiers,
			);

			const documentsWithAnnotations = documents.map((doc) => {
				const targetId = doc.metadata.target_identifier as string;
				const annotation = annotations.get(targetId);

				if (annotation) {
					return {
						...doc,
						pageContent: `${doc.pageContent}\n\nBusiness Context:\n${annotation.content}`,
					};
				}

				return doc;
			});

			// Create Langfuse callback for tracing
			const langfuseCallback = createLangfuseCallback({
				organizationId: auth.organizationId,
				tenantId: auth.tenantId,
				operation: "knowledge-base-store-chunks",
				tags: ["knowledge-base", "embeddings"],
				metadata: {
					chunks_count: documentsWithAnnotations.length,
					gold_sql_count: counts.gold_sql,
					glossary_count: counts.glossary,
				},
			});

			// Use storeChain with callback
			await embeddingService.storeChain.invoke(
				{ documents: documentsWithAnnotations },
				{
					callbacks: langfuseCallback ? [langfuseCallback] : [],
					runName: "Knowledge Base Store Chunks",
				},
			);

			const chunksWithAnnotations = documentsWithAnnotations.filter((doc) =>
				annotations.has(doc.metadata.target_identifier as string),
			).length;

			return c.json({
				success: true,
				message: `Stored ${documents.length} knowledge base chunks`,
				chunks: {
					total: documents.length,
					gold_sql: counts.gold_sql,
					glossary: counts.glossary,
					chunks_with_annotations: chunksWithAnnotations,
				},
			});
		} catch (error) {
			console.error("Error storing knowledge base chunks:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	});
};
