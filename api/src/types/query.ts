import type { Document } from "@langchain/core/documents";
import type { TenantSettings } from "../services/schema-storage.service";

export type ContextChunkSource =
	| "table_overview"
	| "column"
	| "gold_sql"
	| "glossary";

export interface ContextChunk {
	source: ContextChunkSource;
	pageContent: string;
	metadata: Record<string, unknown>;
	score?: number;
}

export interface RetrievalResult {
	chunks: ContextChunk[];
	primaryTable?: string;
	dialect?: string;
	database?: string;
	tenantSettings?: TenantSettings;
}

export interface GeneratedQuery {
	sql: string;
	params: Array<Record<string, unknown>>;
	dialect: string;
	rationale?: string;
}

export interface QueryRunResult extends GeneratedQuery {
	context: ContextChunk[];
	guardrail_notes?: string;
	queryId?: string;
	database?: string;
	table?: string;
	execution?: {
		success: boolean;
		data?: unknown[];
		error?: string;
		rowCount?: number;
		attempts?: number;
	};
}

export type QueryDocument = Document & {
	metadata: Record<string, unknown> & {
		type?: string;
		table?: string;
		dialect?: string;
	};
};
