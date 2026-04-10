import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { supabase } from "../../lib/supabase";
import type {
	ContextChunk,
	ContextChunkSource,
	RetrievalResult,
} from "../../types/query";
import type {
	SchemaStorageService,
	TenantSettings,
} from "../schema-storage.service";

const logger = createLogger("v2:hybrid-retriever");

/** Row shape returned by the `hybrid_search_chunks` RPC. */
interface HybridSearchRow {
	id: number;
	content: string;
	metadata: Record<string, unknown>;
	score: number;
}

/**
 * Hybrid retriever that delegates search entirely to the Postgres
 * `hybrid_search_chunks` RPC function.  Each call performs vector
 * similarity + full-text search with server-side RRF fusion in a
 * single round trip, replacing the previous multi-query approach
 * of separate ILIKE + LangChain vector calls + application-level RRF.
 *
 * Key improvements over the previous implementation:
 *  - Query embedding is generated **once** per retrieval and reused
 *    across all RPC calls (was re-embedded per search call before).
 *  - Full-text search uses tsvector + ts_rank with stemming instead
 *    of ILIKE substring matching with manual stop-word filtering.
 *  - HNSW index on embedding column for fast approximate NN search.
 *  - GIN indexes on fts and metadata columns.
 *  - Two-pass retrieval uses ~5 round trips instead of ~14.
 */
export class HybridRetrieverService {
	private embeddings: OpenAIEmbeddings;

	constructor(
		private readonly schemaStorageService: SchemaStorageService,
	) {
		this.embeddings = new OpenAIEmbeddings({
			openAIApiKey: config.openai.apiKey,
		});
	}

	/**
	 * Call the `hybrid_search_chunks` RPC and map results to ContextChunks.
	 */
	private async hybridSearch(
		queryText: string,
		queryEmbedding: number[],
		filter: Record<string, unknown>,
		matchCount: number,
	): Promise<ContextChunk[]> {
		const { data, error } = await supabase.rpc("hybrid_search_chunks", {
			query_text: queryText,
			query_embedding: queryEmbedding,
			filter,
			match_count: matchCount,
		});

		if (error) {
			logger.error({ err: error, filter }, "Hybrid search RPC failed");
			return [];
		}

		if (!data || data.length === 0) {
			logger.debug(
				{ queryText: queryText.slice(0, 80), filter },
				"Hybrid search returned 0 results",
			);
			return [];
		}

		const chunks = (data as HybridSearchRow[]).map((row) => ({
			source: (row.metadata.type ?? "column") as ContextChunkSource,
			pageContent: row.content,
			metadata: row.metadata,
			score: row.score,
		}));

		logger.debug(
			{
				queryText: queryText.slice(0, 80),
				filter,
				resultCount: chunks.length,
				results: chunks.map((c) => ({
					source: c.source,
					table: c.metadata.table ?? null,
					column: c.metadata.column ?? null,
					score: c.score,
					id: (c.metadata.target_identifier as string)?.slice(0, 60) ?? null,
					preview: c.pageContent.slice(0, 100),
				})),
			},
			"Hybrid search results",
		);

		return chunks;
	}

	/**
	 * Build metadata filter object, omitting undefined/null values.
	 */
	private buildFilter(
		organizationId: string,
		type?: string,
		table?: string,
		database?: string,
		dialect?: string,
	): Record<string, unknown> {
		const filter: Record<string, unknown> = {
			organization_id: organizationId,
		};
		if (type) filter.type = type;
		if (table) filter.table = table;
		if (database) filter.database = database;
		if (dialect) filter.dialect = dialect;
		return filter;
	}

	private extractCandidateTables(chunks: ContextChunk[]): string[] {
		const tables = new Set<string>();
		for (const chunk of chunks) {
			const table = chunk.metadata.table;
			if (typeof table === "string" && table.length > 0) {
				tables.add(table);
			}
		}
		return Array.from(tables);
	}

	private dedupeChunks(chunks: ContextChunk[]): ContextChunk[] {
		const seen = new Set<string>();
		const deduped: ContextChunk[] = [];

		for (const chunk of chunks) {
			const targetIdentifier = chunk.metadata.target_identifier;
			const key = typeof targetIdentifier === "string"
				? `id:${targetIdentifier}`
				: `raw:${chunk.source}:${chunk.metadata.table ?? ""}:${chunk.metadata.column ?? ""}:${chunk.pageContent}`;
			if (seen.has(key)) continue;
			seen.add(key);
			deduped.push(chunk);
		}

		return deduped;
	}

	/**
	 * Retrieve table overview for lightweight guardrail context.
	 */
	async retrieveTableOverview(
		question: string,
		organizationId: string,
		database?: string,
		dialect?: string,
	): Promise<string | undefined> {
		const embedding = await this.embeddings.embedQuery(question);
		const chunks = await this.hybridSearch(
			question,
			embedding,
			this.buildFilter(organizationId, "table_overview", undefined, database, dialect),
			1,
		);
		return chunks[0]?.pageContent;
	}

	/**
	 * Two-pass retrieval:
	 *  Pass 1 — Identify candidate tables via hybrid search on table_overview.
	 *  Pass 2 — Targeted column retrieval scoped to candidate tables,
	 *           plus gold_sql and glossary, all in parallel.
	 *
	 * The query embedding is generated **once** and reused across all calls.
	 */
	async retrieveTwoPass(
		question: string,
		organizationId: string,
		database?: string,
		dialect?: string,
	): Promise<RetrievalResult> {
		// Embed query once, reuse across all RPC calls
		const embedding = await this.embeddings.embedQuery(question);

		// ── Pass 1: Identify candidate tables ────────────────────────
		const tableChunks = await this.hybridSearch(
			question,
			embedding,
			this.buildFilter(organizationId, "table_overview", undefined, database, dialect),
			3,
		);

		const candidateTables = this.extractCandidateTables(tableChunks);

		logger.debug(
			{ candidateTables },
			"Two-pass retrieval: identified candidate tables",
		);

		let resolvedTables = candidateTables;
		let columnChunks: ContextChunk[] = [];
		let goldSqlChunks: ContextChunk[] = [];
		let glossaryChunks: ContextChunk[] = [];

		if (candidateTables.length > 0) {
			// ── Pass 2: Scoped retrieval in parallel ─────────────────────
			const columnPromises = candidateTables.map((table) =>
				this.hybridSearch(
					question,
					embedding,
					this.buildFilter(organizationId, "column", table, database, dialect),
					8,
				),
			);

			const [retrievedGoldSqlChunks, retrievedGlossaryChunks, ...columnResults] =
				await Promise.all([
					this.hybridSearch(
						question,
						embedding,
						this.buildFilter(organizationId, "gold_sql", undefined, database, dialect),
						5,
					),
					this.hybridSearch(
						question,
						embedding,
						this.buildFilter(organizationId, "glossary", undefined, database, dialect),
						3,
					),
					...columnPromises,
				]);

			goldSqlChunks = retrievedGoldSqlChunks;
			glossaryChunks = retrievedGlossaryChunks;
			columnChunks = columnResults.flat();
		} else {
			// Fallback: if table_overview misses, still retrieve gold_sql/glossary.
			// If gold_sql contains table metadata, use it to drive scoped column retrieval.
			const [retrievedGoldSqlChunks, retrievedGlossaryChunks] = await Promise.all([
				this.hybridSearch(
					question,
					embedding,
					this.buildFilter(organizationId, "gold_sql", undefined, database, dialect),
					5,
				),
				this.hybridSearch(
					question,
					embedding,
					this.buildFilter(organizationId, "glossary", undefined, database, dialect),
					3,
				),
			]);

			goldSqlChunks = retrievedGoldSqlChunks;
			glossaryChunks = retrievedGlossaryChunks;
			resolvedTables = this.extractCandidateTables(goldSqlChunks);

			if (resolvedTables.length > 0) {
				logger.info(
					{ fallbackTables: resolvedTables },
					"Two-pass retrieval: table_overview empty, using gold_sql fallback tables",
				);

				const columnResults = await Promise.all(
					resolvedTables.map((table) =>
						this.hybridSearch(
							question,
							embedding,
							this.buildFilter(organizationId, "column", table, database, dialect),
							8,
						),
					),
				);
				columnChunks = columnResults.flat();
			} else {
				logger.warn("Two-pass retrieval: no table_overview or gold_sql table matches");
			}
		}

		const chunks = this.dedupeChunks([
			...tableChunks,
			...columnChunks,
			...goldSqlChunks,
			...glossaryChunks,
		]);

		const primaryTable = resolvedTables[0];
		const retrievedDialect =
			dialect ??
			(tableChunks[0]?.metadata.dialect as string | undefined) ??
			(goldSqlChunks[0]?.metadata.dialect as string | undefined);
		const retrievedDatabase =
			database ??
			(tableChunks[0]?.metadata.database as string | undefined) ??
			(goldSqlChunks[0]?.metadata.database as string | undefined);

		// Fetch tenant settings
		let tenantSettings: TenantSettings | undefined;
		const targetDatabase = retrievedDatabase;
		if (targetDatabase) {
			try {
				const latestSchema =
					await this.schemaStorageService.getLatestSchema(
						organizationId,
						targetDatabase,
					);
				tenantSettings = latestSchema?.tenant_settings;
			} catch (error) {
				logger.error(
					{ err: error },
					"Failed to fetch tenant settings in hybrid retriever",
				);
			}
		}

		logger.info(
			{
				candidateTables: resolvedTables,
				tableCount: tableChunks.length,
				columnCount: columnChunks.length,
				goldCount: goldSqlChunks.length,
				glossaryCount: glossaryChunks.length,
				totalChunks: chunks.length,
			},
			"Two-pass hybrid retrieval completed",
		);

		return {
			chunks,
			primaryTable,
			dialect: retrievedDialect,
			database: retrievedDatabase,
			tenantSettings,
		};
	}
}
