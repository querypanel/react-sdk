/**
 * Session history records for context-aware queries.
 */

export interface QuerySessionRecord {
	id: string;
	session_id: string;
	organization_id: string;
	tenant_id: string | null;
	user_id: string | null;
	title: string | null;
	created_at: string;
	updated_at: string;
}

export interface QuerySessionTurnRecord {
	id: string;
	session_id: string;
	turn_index: number;
	question: string;
	sql: string | null;
	rationale: string | null;
	row_count: number | null;
	fields: string[] | null;
	error: string | null;
	params: Array<Record<string, unknown>> | null;
	modification_type: string | null;
	created_at: string;
}

export interface QuerySessionWithTurns extends QuerySessionRecord {
	turns?: QuerySessionTurnRecord[];
}

/**
 * Minimal turn context for SQL generation prompts.
 */
export interface SessionTurnContext {
	question: string;
	sql?: string | null;
	rationale?: string | null;
	created_at?: string | null;
	params?: Array<Record<string, unknown>> | null;
}
