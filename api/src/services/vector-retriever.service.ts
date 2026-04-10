import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { RunnableLambda } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../config";
import { supabase } from "../lib/supabase";
import type {
	ContextChunk,
	ContextChunkSource,
	QueryDocument,
	RetrievalResult,
} from "../types/query";
import type {
	SchemaStorageService,
	TenantSettings,
} from "./schema-storage.service";

/** Input type for retrieval chain - must contain question and organizationId */
export interface RetrievalInput {
	question: string;
	organizationId: string;
	database?: string;
	dialect?: string;
	[key: string]: unknown;
}

/** Output type for retrieval chain - includes the original input plus retrieval result */
export type RetrievalOutput<T extends RetrievalInput> = T & {
	retrieval: RetrievalResult;
};

export class VectorRetrieverService {
	private embeddings: OpenAIEmbeddings;
	private schemaStorageService: SchemaStorageService;

	constructor(schemaStorageService: SchemaStorageService) {
		this.embeddings = new OpenAIEmbeddings({
			openAIApiKey: config.openai.apiKey,
		});
		this.schemaStorageService = schemaStorageService;
	}

	/**
	 * LangChain Runnable chain for vector retrieval
	 * Retrieves relevant context chunks from the vector store
	 */
	public retrievalChain = RunnableLambda.from(
		async <T extends RetrievalInput>(input: T): Promise<RetrievalOutput<T>> => {
			const result = await this.retrieve(
				input.question,
				input.organizationId,
				input.database,
				input.dialect,
			);
			return {
				...input,
				retrieval: result,
			};
		},
	);

	/**
	 * LangChain Runnable chain for table overview retrieval
	 * Retrieves just the most relevant table_overview chunk for guardrail context
	 */
	public tableOverviewChain = RunnableLambda.from(
		async <T extends RetrievalInput>(
			input: T,
		): Promise<T & { schemaContext?: string }> => {
			const schemaContext = await this.retrieveTableOverview(
				input.question,
				input.organizationId,
				input.database,
				input.dialect,
			);
			return {
				...input,
				schemaContext,
			};
		},
	);

	private async buildStore(filter: Record<string, unknown>) {
		return SupabaseVectorStore.fromExistingIndex(this.embeddings, {
			client: supabase,
			tableName: config.database.tableName,
			queryName: config.database.queryName,
			filter,
		});
	}
	async search(
		question: string,
		organizationId: string,
		type: string,
		topK: number,
		table?: string,
		database?: string,
		dialect?: string,
	): Promise<ContextChunk[]> {
		const filter: Record<string, unknown> = {
			organization_id: organizationId,
			type,
		};

		// Filter by table if provided
		if (table) {
			filter.table = table;
		}

		if (database) {
			filter.database = database;
		}

		if (dialect) {
			filter.dialect = dialect;
		}

		const store = await this.buildStore(filter);

		const results = await store.similaritySearchWithScore(question, topK);

		return results.map(([doc, score]) =>
			this.toChunk(doc as QueryDocument, score),
		);
	}

	private toChunk(doc: QueryDocument, score?: number): ContextChunk {
		return {
			source: (doc.metadata.type || "column") as ContextChunkSource,
			pageContent: doc.pageContent,
			metadata: doc.metadata,
			score,
		};
	}

	/**
	 * Retrieves just the most relevant table_overview chunk for guardrail context
	 * This is a lightweight retrieval used before the full context retrieval
	 */
	async retrieveTableOverview(
		question: string,
		organizationId: string,
		database?: string,
		dialect?: string,
	): Promise<string | undefined> {
		const tableChunks = await this.search(
			question,
			organizationId,
			"table_overview",
			1,
			undefined, // table - not filtering by specific table for table_overview
			database,
			dialect,
		);

		return tableChunks[0]?.pageContent;
	}

	async retrieve(
		question: string,
		organizationId: string,
		database?: string,
		dialect?: string,
	): Promise<RetrievalResult> {
		const [tableChunks, columnChunks, goldChunks, glossaryChunks] =
			await Promise.all([
				this.search(
					question,
					organizationId,
					"table_overview",
					1,
					undefined, // table - not filtering by specific table for initial search
					database,
					dialect,
				),
				this.search(
					question,
					organizationId,
					"column",
					10,
					undefined, // table - will be filtered after we find primary table
					database,
					dialect,
				),
				this.search(
					question,
					organizationId,
					"gold_sql",
					5,
					undefined,
					database,
					dialect,
				),
				this.search(
					question,
					organizationId,
					"glossary",
					3,
					undefined,
					database,
					dialect,
				),
			]);

		console.log({
			tableChunks,
			columnChunks,
			goldChunks,
			glossaryChunks,
		});
		const chunks = [
			...tableChunks,
			...columnChunks,
			...goldChunks,
			...glossaryChunks,
		];

		const primaryTable = tableChunks[0]?.metadata.table as string | undefined;
		const retrievedDialect = tableChunks[0]?.metadata.dialect as
			| string
			| undefined;
		const retrievedDatabase = tableChunks[0]?.metadata.database as
			| string
			| undefined;

		// Fetch tenant settings if database is available
		let tenantSettings: TenantSettings | undefined;
		const targetDatabase = database ?? retrievedDatabase;

		if (targetDatabase) {
			try {
				const latestSchema = await this.schemaStorageService.getLatestSchema(
					organizationId,
					targetDatabase,
				);
				tenantSettings = latestSchema?.tenant_settings;
			} catch (error) {
				// Log error but don't fail the retrieval
				console.error("Failed to fetch tenant settings:", error);
			}
		}

		return {
			chunks,
			primaryTable,
			dialect: dialect ?? retrievedDialect,
			database: targetDatabase,
			tenantSettings,
		};
	}
}
