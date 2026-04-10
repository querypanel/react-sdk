import { Document } from "@langchain/core/documents";
import { createLangfuseCallback } from "../lib/langfuse-callback";
import { supabase } from "../lib/supabase";
import type {
	CreateKnowledgeBaseAnnotationInput,
	KnowledgeBaseAnnotation,
} from "../types/knowledge-base";
import { EmbeddingService } from "./embedding.service";

export class KnowledgeBaseService {
	private embeddingService: EmbeddingService;

	constructor(embeddingService?: EmbeddingService) {
		this.embeddingService = embeddingService ?? new EmbeddingService();
	}

	/**
	 * Creates or updates an annotation and triggers re-embedding
	 */
	async upsert(
		input: CreateKnowledgeBaseAnnotationInput,
	): Promise<KnowledgeBaseAnnotation> {
		const { organization_id, target_identifier, content, user_id } = input;

		// First, fetch any existing chunks before we delete them
		const existingChunks = await this.embeddingService.getByTargetIdentifier(
			organization_id,
			target_identifier,
		);

		// Delete any existing chunks for this target_identifier
		await this.embeddingService.deleteByTargetIdentifier(
			organization_id,
			target_identifier,
		);

		// Upsert the annotation
		const { data, error } = await supabase
			.from("schema_annotations")
			.upsert(
				{
					organization_id,
					target_identifier,
					content,
					created_by: user_id,
					updated_by: user_id,
				},
				{
					onConflict: "organization_id,target_identifier",
				},
			)
			.select()
			.single();

		if (error) {
			throw new Error(
				`Failed to upsert knowledge base annotation: ${error.message}`,
			);
		}

		const annotation = data as KnowledgeBaseAnnotation;

		// Re-embed existing chunks with the new annotation
		for (const chunk of existingChunks) {
			await this.reEmbedChunk(
				chunk.pageContent,
				chunk.metadata,
				annotation,
				organization_id,
			);
		}

		return annotation;
	}

	/**
	 * Finds all annotations for an organization
	 */
	async findByOrganization(
		organizationId: string,
	): Promise<KnowledgeBaseAnnotation[]> {
		const { data, error } = await supabase
			.from("schema_annotations")
			.select("*")
			.eq("organization_id", organizationId)
			.order("created_at", { ascending: false });

		if (error) {
			throw new Error(
				`Failed to fetch knowledge base annotations: ${error.message}`,
			);
		}

		return (data as KnowledgeBaseAnnotation[]) || [];
	}

	/**
	 * Finds a specific annotation by target identifier
	 */
	async findByTargetIdentifier(
		organizationId: string,
		targetIdentifier: string,
	): Promise<KnowledgeBaseAnnotation | null> {
		const { data, error } = await supabase
			.from("schema_annotations")
			.select("*")
			.eq("organization_id", organizationId)
			.eq("target_identifier", targetIdentifier)
			.single();

		if (error && error.code !== "PGRST116") {
			throw new Error(
				`Failed to fetch knowledge base annotation: ${error.message}`,
			);
		}

		return (data as KnowledgeBaseAnnotation) || null;
	}

	/**
	 * Batch lookup annotations by multiple target identifiers
	 * Handles large arrays by batching requests to avoid Supabase limits
	 */
	async findByTargetIdentifiers(
		organizationId: string,
		targetIdentifiers: string[],
	): Promise<Map<string, KnowledgeBaseAnnotation>> {
		if (targetIdentifiers.length === 0) {
			return new Map();
		}

		const annotationMap = new Map<string, KnowledgeBaseAnnotation>();
		const BATCH_SIZE = 100; // Supabase/PostgREST has limits on IN clause size

		// Process in batches
		for (let i = 0; i < targetIdentifiers.length; i += BATCH_SIZE) {
			const batch = targetIdentifiers.slice(i, i + BATCH_SIZE);

			const { data, error } = await supabase
				.from("schema_annotations")
				.select("*")
				.eq("organization_id", organizationId)
				.in("target_identifier", batch);

			if (error) {
				console.error(`Failed to batch fetch annotations: ${error.message}`);
				throw new Error(
					`Failed to batch fetch knowledge base annotations: ${error.message}`,
				);
			}

			if (data) {
				for (const annotation of data as KnowledgeBaseAnnotation[]) {
					annotationMap.set(annotation.target_identifier, annotation);
				}
			}
		}

		return annotationMap;
	}

	/**
	 * Deletes an annotation and triggers re-embedding
	 */
	async delete(
		organizationId: string,
		targetIdentifier: string,
	): Promise<void> {
		// Delete the annotation from the database
		const { error } = await supabase
			.from("schema_annotations")
			.delete()
			.eq("organization_id", organizationId)
			.eq("target_identifier", targetIdentifier);

		if (error) {
			throw new Error(
				`Failed to delete knowledge base annotation: ${error.message}`,
			);
		}

		// Delete the chunk so it can be re-ingested without annotation
		await this.embeddingService.deleteByTargetIdentifier(
			organizationId,
			targetIdentifier,
		);
	}

	/**
	 * Re-embeds a chunk with or without annotation
	 */
	async reEmbedChunk(
		originalContent: string,
		metadata: Record<string, any>,
		annotation?: KnowledgeBaseAnnotation,
		organizationId?: string,
	): Promise<void> {
		let content = originalContent;

		// Append annotation if it exists
		if (annotation) {
			content += `\n\nBusiness Context:\n${annotation.content}`;
		}

		// Create a new document with the combined content
		// Preserve created_at if it exists, otherwise set it now
		const document = new Document({
			pageContent: content,
			metadata: {
				...metadata,
				created_at: metadata.created_at || new Date().toISOString(),
			},
		});

		// Create Langfuse callback for tracing if organizationId is provided
		const langfuseCallback = organizationId
			? createLangfuseCallback({
					organizationId,
					operation: "knowledge-base-re-embed-chunk",
					tags: ["knowledge-base", "re-embed", "embeddings"],
					metadata: {
						target_identifier: metadata.target_identifier,
						has_annotation: !!annotation,
					},
				})
			: undefined;

		// Store the document with embeddings using storeChain
		await this.embeddingService.storeChain.invoke(
			{ documents: [document] },
			{
				callbacks: langfuseCallback ? [langfuseCallback] : [],
				runName: "Knowledge Base Re-embed Chunk",
			},
		);
	}
}
