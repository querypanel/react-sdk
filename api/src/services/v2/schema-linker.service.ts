import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { buildTelemetry, type TelemetryContext } from "../../lib/telemetry";
import type { ContextChunk } from "../../types/query";

const logger = createLogger("v2:schema-linker");

/**
 * A single linked entity: a question mention resolved to a concrete
 * schema element (table, column, or value).
 */
const linkedEntitySchema = z.object({
	mention: z.string().describe("The exact noun or phrase from the user's question"),
	table: z.string().describe("The matching table name from the context (must exist in context)"),
	column: z.string().nullable().describe("The matching column name, or null if the mention maps to a table only"),
	reasoning: z.string().describe("One sentence explaining why this mapping was chosen over alternatives"),
});

const schemaLinkingResultSchema = z.object({
	linkedEntities: z
		.array(linkedEntitySchema)
		.describe("One entry per noun, metric, or entity in the question that maps to a schema element"),
	resolvedTables: z
		.array(z.string())
		.describe("Deduplicated list of all table names needed to answer this query (must exist in context)"),
	prunedChunkIds: z
		.array(z.string())
		.describe("target_identifiers of context chunks that are NOT relevant and should be removed before SQL generation"),
	joinHints: z
		.array(z.string())
		.nullable()
		.describe("Suggested JOIN conditions inferred from column names, e.g. 'orders.customer_id = customers.id'. Null if only one table is needed."),
});

export type SchemaLinkingResult = z.infer<typeof schemaLinkingResultSchema>;

/**
 * Schema linker: maps entities mentioned in the user question to
 * concrete table.column pairs from the retrieved context.
 *
 * This step sits between retrieval and SQL generation. It:
 * 1. Resolves ambiguous references ("sales" → orders.total_amount)
 * 2. Validates intent plan tables against actual context
 * 3. Prunes irrelevant chunks so the SQL generator sees less noise
 * 4. Suggests JOIN conditions when multiple tables are needed
 */
export async function linkSchema(input: {
	question: string;
	contextChunks: ContextChunk[];
	intentTables?: string[];
	intentOperations?: string[];
	telemetry?: TelemetryContext;
}): Promise<SchemaLinkingResult> {
	const contextBlock = input.contextChunks
		.map((chunk) => {
			const id =
				(chunk.metadata.target_identifier as string) ??
				chunk.pageContent.slice(0, 60);
			const table = chunk.metadata.table
				? `  table: ${chunk.metadata.table}`
				: "";
			const column = chunk.metadata.column
				? `  column: ${chunk.metadata.column}`
				: "";
			return [`[${id}]`, `  source: ${chunk.source}`, table, column, `  content: ${chunk.pageContent}`]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n---\n");

	const intentBlock = input.intentTables?.length
		? `Intent suggested tables: ${input.intentTables.join(", ")}\nIntent suggested operations: ${(input.intentOperations ?? []).join(", ")}`
		: "No intent plan available.";

	const { object } = await generateObject({
		model: openai(config.models.schemaLinker),
		schema: schemaLinkingResultSchema,
		system: `# Role
You are a schema linker in a text-to-SQL pipeline. You sit between retrieval and SQL generation.

# Task
Map every noun, metric, and entity in the user's question to concrete table.column pairs from the retrieved context chunks, then prune irrelevant chunks to reduce noise for the downstream SQL generator.

# Instructions

## Entity Linking
For each meaningful noun/metric in the question:
1. Find the best matching table and column in the context chunks.
2. Context chunks are authoritative — if the intent plan suggested table names that conflict, use the context names.
3. If a mention is ambiguous (e.g. "sales" could be revenue or count), pick the most likely match and explain your choice in \`reasoning\`.

## Pruning (prunedChunkIds)
List target_identifiers of chunks that are NOT needed to answer this question.
- Be aggressive with columns: remove columns from unrelated tables and irrelevant glossary entries.
- Be CONSERVATIVE with gold_sql: only prune a gold_sql chunk if it is clearly about a completely different topic. When in doubt, keep it — gold_sql chunks are curated expert references.
- Always keep: table overviews for needed tables, columns that could appear in SELECT/WHERE/GROUP BY, and loosely related gold_sql examples.

## Join Hints
If the query requires multiple tables, suggest JOIN conditions based on matching column names/types (e.g. "orders.customer_id = customers.id"). Only suggest joins you can confidently infer.

## Resolved Tables
List all tables needed to answer the query. They must exist in the context — never invent table names.`,
		prompt: [
			`## Question\n${input.question}`,
			`## Intent Plan\n${intentBlock}`,
			`## Context Chunks\nEach chunk is prefixed with its [target_identifier].\n\n${contextBlock}`,
		].join("\n\n"),
		experimental_telemetry: buildTelemetry("schema_linking", input.telemetry, ["nl_to_sql"]),
	});

	logger.debug(
		{
			linkedEntities: object.linkedEntities.map((e) => ({
				mention: e.mention,
				table: e.table,
				column: e.column,
				reasoning: e.reasoning,
			})),
			resolvedTables: object.resolvedTables,
			prunedChunkIds: object.prunedChunkIds,
			joinHints: object.joinHints,
		},
		"Schema linking completed",
	);

	return object;
}

/**
 * Apply schema linking results to prune context chunks.
 * Returns only the chunks that were NOT pruned.
 */
export function applyPruning(
	chunks: ContextChunk[],
	linking: SchemaLinkingResult,
): ContextChunk[] {
	const prunedSet = new Set(linking.prunedChunkIds);
	if (prunedSet.size === 0) {
		logger.debug("No chunks marked for pruning, keeping all");
		return chunks;
	}

	const kept: Array<{ source: string; table: unknown; column: unknown; id: string | null; reason: string }> = [];
	const removed: Array<{ source: string; table: unknown; column: unknown; id: string | null }> = [];

	const result = chunks.filter((chunk) => {
		const id = chunk.metadata.target_identifier as string | undefined;

		if (chunk.source === "gold_sql") {
			kept.push({ source: chunk.source, table: chunk.metadata.table ?? null, column: chunk.metadata.column ?? null, id: id ?? null, reason: "gold_sql (never pruned)" });
			return true;
		}
		if (!id) {
			kept.push({ source: chunk.source, table: chunk.metadata.table ?? null, column: chunk.metadata.column ?? null, id: null, reason: "no target_identifier" });
			return true;
		}
		if (prunedSet.has(id)) {
			removed.push({ source: chunk.source, table: chunk.metadata.table ?? null, column: chunk.metadata.column ?? null, id });
			return false;
		}
		kept.push({ source: chunk.source, table: chunk.metadata.table ?? null, column: chunk.metadata.column ?? null, id, reason: "not in pruned set" });
		return true;
	});

	logger.debug(
		{
			totalBefore: chunks.length,
			totalAfter: result.length,
			removedCount: removed.length,
			kept,
			removed,
		},
		"Context pruning applied",
	);

	return result;
}
