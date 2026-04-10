import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { Document } from "@langchain/core/documents";
import { RunnableLambda } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../config";
import { supabase } from "../lib/supabase";

/** Input type for store chain - must contain documents array */
export interface StoreInput {
	documents: Document[];
	callbacks?: any[];
	[key: string]: unknown;
}

/** Input type for search chain - must contain query and organizationId */
export interface SearchInput {
	query: string;
	organizationId: string;
	limit?: number;
	callbacks?: any[];
	[key: string]: unknown;
}

/** Output type for search chain - includes the original input plus results */
export type SearchOutput<T extends SearchInput> = T & {
	results: Document[];
};

export class EmbeddingService {
	private embeddings: OpenAIEmbeddings;

	constructor() {
		this.embeddings = new OpenAIEmbeddings({
			openAIApiKey: config.openai.apiKey,
		});
	}

	/**
	 * LangChain Runnable chain for storing documents
	 * Stores document embeddings in the vector database
	 */
	public storeChain = RunnableLambda.from(
		async <T extends StoreInput>(input: T): Promise<T> => {
			await this.storeDocuments(input.documents);
			return input;
		},
	);

	/**
	 * LangChain Runnable chain for searching documents
	 * Retrieves similar documents from the vector database
	 */
	public searchChain = RunnableLambda.from(
		async <T extends SearchInput>(input: T): Promise<SearchOutput<T>> => {
			const results = await this.search(
				input.query,
				input.organizationId,
				input.limit,
			);
			return {
				...input,
				results,
			};
		},
	);

	async storeDocuments(documents: Document[]): Promise<void> {
		await SupabaseVectorStore.fromDocuments(documents, this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
		});
	}

	async search(
		query: string,
		organizationId: string,
		limit: number = 5,
	): Promise<Document[]> {
		const store = await SupabaseVectorStore.fromExistingIndex(this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
			filter: { organization_id: organizationId },
		});

		const results = await store.similaritySearch(query, limit);
		return results;
	}

	async getByTargetIdentifier(
		organizationId: string,
		targetIdentifier: string,
	): Promise<Document[]> {
		// Query to find chunks matching the target_identifier and organization_id
		const { data, error } = await supabase
			.from(config.database.tableName)
			.select("content, metadata")
			.contains("metadata", {
				organization_id: organizationId,
				target_identifier: targetIdentifier,
			});

		if (error) {
			throw new Error(`Failed to find chunks: ${error.message}`);
		}

		if (!data || data.length === 0) {
			return [];
		}

		// Convert to Document objects
		return data.map(
			(row) =>
				new Document({
					pageContent: row.content,
					metadata: row.metadata,
				}),
		);
	}

	/**
	 * Remove all **schema-derived** chunks for a logical database (`table_overview`
	 * and `column` metadata types). Covers dropped tables/columns that are no longer
	 * in the ingest payload. Does **not** delete knowledge-base chunks (`gold_sql`,
	 * `glossary`) for the same database.
	 */
	async deleteSchemaDerivedChunksForDatabase(
		organizationId: string,
		database: string,
	): Promise<void> {
		const { data, error } = await supabase
			.from(config.database.tableName)
			.select("id")
			.contains("metadata", { organization_id: organizationId })
			.eq("metadata->>database", database)
			.in("metadata->>type", ["table_overview", "column"]);

		if (error) {
			throw new Error(
				`Failed to list schema chunks for database cleanup: ${error.message}`,
			);
		}

		if (!data || data.length === 0) {
			return;
		}

		const ids = data.map((row) => row.id);
		const store = await SupabaseVectorStore.fromExistingIndex(this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
		});

		await store.delete({ ids });
	}

	/**
	 * Delete all chunks whose metadata.target_identifier starts with `prefix`
	 * (organization scoped). Used before re-embedding schema so dropped columns
	 * (e.g. created_at → order_date) do not stay in the vector index.
	 */
	async deleteByTargetIdentifierPrefix(
		organizationId: string,
		prefix: string,
	): Promise<void> {
		const { data, error } = await supabase
			.from(config.database.tableName)
			.select("id")
			.contains("metadata", {
				organization_id: organizationId,
			})
			.like("metadata->>target_identifier", `${prefix}%`);

		if (error) {
			throw new Error(
				`Failed to list chunks by target_identifier prefix: ${error.message}`,
			);
		}

		if (!data || data.length === 0) {
			return;
		}

		const ids = data.map((row) => row.id);
		const store = await SupabaseVectorStore.fromExistingIndex(this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
		});

		await store.delete({ ids });
	}

	async deleteByTargetIdentifier(
		organizationId: string,
		targetIdentifier: string,
	): Promise<void> {
		// Query to find chunk IDs matching the target_identifier and organization_id
		const { data, error } = await supabase
			.from(config.database.tableName)
			.select("id")
			.contains("metadata", {
				organization_id: organizationId,
				target_identifier: targetIdentifier,
			});

		if (error) {
			throw new Error(`Failed to find chunks: ${error.message}`);
		}

		if (!data || data.length === 0) {
			return; // No chunks to delete
		}

		// Extract IDs and delete them
		const ids = data.map((row) => row.id);
		const store = await SupabaseVectorStore.fromExistingIndex(this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
		});

		await store.delete({ ids });
	}
}
