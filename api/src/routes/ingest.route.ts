import type { Hono } from "hono";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import { createLogger } from "../lib/logger";
import { ingestRequestSchema } from "../schemas/ingest.schema";
import type { ChunkerService } from "../services/chunker.service";
import type { EmbeddingService } from "../services/embedding.service";
import type { KnowledgeBaseService } from "../services/knowledge-base.service";
import {
	type SchemaStorageService,
	deriveTimeColumnsFromSchemaTables,
	type SchemaConfig,
} from "../services/schema-storage.service";
import type { AppContext } from "../types/app";

interface IngestRouteDeps {
	chunkerService: ChunkerService;
	embeddingService: EmbeddingService;
	schemaStorageService: SchemaStorageService;
	knowledgeBaseService: KnowledgeBaseService;
}

export const registerIngestRoutes = (
	app: Hono<AppContext>,
	{
		chunkerService,
		embeddingService,
		schemaStorageService,
		knowledgeBaseService,
	}: IngestRouteDeps,
) => {
	const logger = createLogger("ingest-route");

	app.post("/ingest", async (c) => {
		const auth = c.get("auth");

		// Validate auth context has required fields
		if (!auth.organizationId || !auth.tenantId) {
			return c.json(
				{ error: "Authentication required with organization_id and tenant_id" },
				401,
			);
		}

		try {
			const body = await c.req.json();
			logger.debug({ body }, "Received ingest request");

			const validatedData = ingestRequestSchema.parse(body);
			logger.debug(
				{
					organization_id: auth.organizationId,
					dialect: validatedData.dialect,
					tablesCount: validatedData.tables.length,
				},
				"Request validated successfully",
			);

			const timeColumns = deriveTimeColumnsFromSchemaTables(validatedData);
			const schemaConfig: SchemaConfig | undefined =
				timeColumns.length > 0 ? { timeColumns } : undefined;

			const saveResult = await schemaStorageService.saveSchema(
				validatedData,
				auth.organizationId,
				validatedData.tenant_settings,
				schemaConfig,
			);
			logger.debug(
				{
					schema_id: saveResult.id,
					schema_hash: saveResult.hash,
					drift_detected: saveResult.isDrift,
				},
				"Schema saved to storage",
			);

			// If schema already exists with same hash and force_reindex is not true, skip processing
			if (
				saveResult.hasExistingSchema &&
				!saveResult.isDrift &&
				!validatedData.force_reindex
			) {
				logger.info("No schema drift detected, skipping embedding");
				return c.json({
					success: true,
					message: "Schema unchanged, skipped re-embedding",
					chunks: 0,
					chunks_with_annotations: 0,
					schema_id: saveResult.id,
					schema_hash: saveResult.hash,
					drift_detected: false,
					skipped: true,
				});
			}

			// Drop all schema-derived chunks for this org + logical database (not
			// per-table only), so removed tables/columns disappear from the index.
			// Scoped to metadata.type table_overview | column so gold_sql / glossary
			// (same database prefix in target_identifier) are preserved.
			await embeddingService.deleteSchemaDerivedChunksForDatabase(
				auth.organizationId,
				validatedData.database,
			);
			logger.debug(
				{
					database: validatedData.database,
					tables: validatedData.tables.map((t) => t.table_name),
				},
				"Cleared schema-derived vector chunks for database before re-embed",
			);

			const documents = chunkerService.chunkSchema(
				validatedData,
				auth.organizationId,
			);
			logger.debug(
				{ chunksCount: documents.length },
				"Schema chunked into documents",
			);

			const targetIdentifiers = documents
				.map((doc) => doc.metadata.target_identifier)
				.filter((id): id is string => id !== undefined);
			logger.debug(
				{ targetIdentifiersCount: targetIdentifiers.length },
				"Extracted target identifiers",
			);

			const annotations = await knowledgeBaseService.findByTargetIdentifiers(
				auth.organizationId,
				targetIdentifiers,
			);
			logger.debug(
				{ annotationsCount: annotations.size },
				"Retrieved business context annotations",
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

			const chunksWithAnnotations = documentsWithAnnotations.filter((doc) =>
				annotations.has(doc.metadata.target_identifier as string),
			).length;
			logger.debug(
				{ chunksWithAnnotations, totalChunks: documents.length },
				"Applied business context annotations to chunks",
			);

			// Create Langfuse callback for tracing
			const langfuseCallback = createLangfuseCallback({
				organizationId: auth.organizationId,
				tenantId: auth.tenantId,
				operation: "ingest-store-embeddings",
				tags: ["ingest", "embeddings"],
				metadata: {
					chunks_count: documentsWithAnnotations.length,
					chunks_with_annotations: chunksWithAnnotations,
					schema_id: saveResult.id,
				},
			});

			// Use storeChain with callback
			await embeddingService.storeChain.invoke(
				{ documents: documentsWithAnnotations },
				{
					callbacks: langfuseCallback ? [langfuseCallback] : [],
					runName: "Ingest Store Embeddings",
				},
			);
			logger.debug("Documents embedded and stored in vector database");

			const response = {
				success: true,
				message: `Successfully ingested ${documents.length} chunks`,
				chunks: documents.length,
				chunks_with_annotations: chunksWithAnnotations,
				schema_id: saveResult.id,
				schema_hash: saveResult.hash,
				drift_detected: saveResult.isDrift,
			};

			logger.info(response, "Ingest completed successfully");
			return c.json(response);
		} catch (error) {
			logger.error({ error }, "Error ingesting schema");
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
