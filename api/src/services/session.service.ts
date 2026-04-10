import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { AuthContext } from "../types/auth";
import type {
	QuerySessionRecord,
	QuerySessionTurnRecord,
	QuerySessionWithTurns,
	SessionTurnContext,
} from "../types/session";
import type { SessionListQuery } from "../schemas/session.schema";
import type { PaginatedResponse } from "../schemas/saved-chart.schema";

const logger = createLogger("session-service");

type SessionInsertPayload = {
	session_id: string;
	organization_id: string;
	tenant_id: string | null;
	user_id: string | null;
	title?: string | null;
};

type SessionTurnInsertPayload = {
	session_id: string;
	turn_index: number;
	question: string;
	sql?: string | null;
	rationale?: string | null;
	row_count?: number | null;
	fields?: string[] | null;
	error?: string | null;
	params?: Array<Record<string, unknown>> | null;
	modification_type?: string | null;
};

function applyTenantFilter<T extends { eq: any; is: any }>(
	query: T,
	tenantId?: string | null,
): T {
	if (tenantId) {
		return query.eq("tenant_id", tenantId);
	}
	return query.is("tenant_id", null);
}

function deriveTitle(question: string): string {
	const trimmed = question.trim();
	if (!trimmed) return "Untitled Session";
	return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

export class SessionService {
	/**
	 * Retrieves a session by public session_id.
	 */
	async getSessionBySessionId(
		auth: AuthContext,
		sessionId: string,
	): Promise<QuerySessionRecord | null> {
		let query = supabase
			.from("query_sessions")
			.select("*")
			.eq("organization_id", auth.organizationId)
			.eq("session_id", sessionId);

		query = applyTenantFilter(query, auth.tenantId ?? null);

		const { data, error } = await query.maybeSingle();

		if (error) {
			logger.error({ error }, "Failed to fetch session");
			throw new Error(`Failed to fetch session: ${error.message}`);
		}

		return (data as QuerySessionRecord) ?? null;
	}

	/**
	 * Creates a session if it doesn't exist.
	 */
	async getOrCreateSession(
		auth: AuthContext,
		sessionId: string,
		options?: { title?: string },
	): Promise<QuerySessionRecord> {
		const existing = await this.getSessionBySessionId(auth, sessionId);
		if (existing) return existing;

		const insertPayload: SessionInsertPayload = {
			session_id: sessionId,
			organization_id: auth.organizationId!,
			tenant_id: auth.tenantId ?? null,
			user_id: auth.userId ?? null,
			title: options?.title ?? null,
		};

		const { data, error } = await supabase
			.from("query_sessions")
			.insert(insertPayload)
			.select()
			.single();

		if (error) {
			logger.error({ error }, "Failed to create session");
			throw new Error(`Failed to create session: ${error.message}`);
		}

		return data as QuerySessionRecord;
	}

	/**
	 * Adds a new turn to a session and auto-increments turn_index.
	 */
	async addTurn(
		auth: AuthContext,
		sessionId: string,
		turn: SessionTurnContext & {
			rowCount?: number | null;
			fields?: string[] | null;
			error?: string | null;
			modificationType?: string | null;
		},
	): Promise<QuerySessionTurnRecord> {
		const session = await this.getOrCreateSession(auth, sessionId, {
			title: deriveTitle(turn.question),
		});

		const { data: lastTurn, error: lastTurnError } = await supabase
			.from("query_session_turns")
			.select("turn_index")
			.eq("session_id", session.id)
			.order("turn_index", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (lastTurnError) {
			logger.error({ error: lastTurnError }, "Failed to fetch last turn");
			throw new Error(`Failed to fetch last turn: ${lastTurnError.message}`);
		}

		const nextIndex = (lastTurn?.turn_index ?? -1) + 1;
		const insertPayload: SessionTurnInsertPayload = {
			session_id: session.id,
			turn_index: nextIndex,
			question: turn.question,
			sql: turn.sql ?? null,
			rationale: turn.rationale ?? null,
			row_count: turn.rowCount ?? null,
			fields: turn.fields ?? null,
			error: turn.error ?? null,
			params: turn.params ?? null,
			modification_type: turn.modificationType ?? null,
		};

		const { data, error } = await supabase
			.from("query_session_turns")
			.insert(insertPayload)
			.select()
			.single();

		if (error) {
			logger.error({ error }, "Failed to create session turn");
			throw new Error(`Failed to create session turn: ${error.message}`);
		}

		return data as QuerySessionTurnRecord;
	}

	/**
	 * Retrieves recent turns for a session, ordered oldest to newest.
	 */
	async getRecentTurns(
		auth: AuthContext,
		sessionId: string,
		limit = 5,
	): Promise<QuerySessionTurnRecord[]> {
		const session = await this.getSessionBySessionId(auth, sessionId);
		if (!session) return [];

		const { data, error } = await supabase
			.from("query_session_turns")
			.select("*")
			.eq("session_id", session.id)
			.order("turn_index", { ascending: false })
			.limit(limit);

		if (error) {
			logger.error({ error }, "Failed to fetch session turns");
			throw new Error(`Failed to fetch session turns: ${error.message}`);
		}

		const turns = (data as QuerySessionTurnRecord[]) ?? [];
		return turns.reverse();
	}

	/**
	 * Retrieves a session with optional turns.
	 */
	async getSession(
		auth: AuthContext,
		sessionId: string,
		options?: { includeTurns?: boolean },
	): Promise<QuerySessionWithTurns | null> {
		const session = await this.getSessionBySessionId(auth, sessionId);
		if (!session) return null;

		if (!options?.includeTurns) return session;

		const { data, error } = await supabase
			.from("query_session_turns")
			.select("*")
			.eq("session_id", session.id)
			.order("turn_index", { ascending: true });

		if (error) {
			logger.error({ error }, "Failed to fetch session turns");
			throw new Error(`Failed to fetch session turns: ${error.message}`);
		}

		return {
			...session,
			turns: (data as QuerySessionTurnRecord[]) ?? [],
		};
	}

	/**
	 * Lists sessions with pagination, filtering, and sorting.
	 */
	async listSessions(
		auth: AuthContext,
		query: SessionListQuery,
	): Promise<PaginatedResponse<QuerySessionRecord>> {
		const {
			page,
			limit,
			sort_by,
			sort_dir,
			title,
			user_id,
			created_from,
			created_to,
			updated_from,
			updated_to,
		} = query;

		const offset = (page - 1) * limit;

		let baseQuery = supabase
			.from("query_sessions")
			.select("*", { count: "exact" })
			.eq("organization_id", auth.organizationId);

		baseQuery = applyTenantFilter(baseQuery, auth.tenantId ?? null);

		if (title) {
			baseQuery = baseQuery.ilike("title", `%${title}%`);
		}
		if (user_id) {
			baseQuery = baseQuery.eq("user_id", user_id);
		}
		if (created_from) {
			baseQuery = baseQuery.gte("created_at", created_from);
		}
		if (created_to) {
			baseQuery = baseQuery.lte("created_at", created_to);
		}
		if (updated_from) {
			baseQuery = baseQuery.gte("updated_at", updated_from);
		}
		if (updated_to) {
			baseQuery = baseQuery.lte("updated_at", updated_to);
		}

		const { count, error: countError } = await baseQuery;
		if (countError) {
			logger.error({ error: countError }, "Failed to count sessions");
			throw new Error(`Failed to count sessions: ${countError.message}`);
		}

		const sortMap: Record<string, string> = {
			title: "title",
			user_id: "user_id",
			created_at: "created_at",
			updated_at: "updated_at",
		};
		const sortColumn = sortMap[sort_by] ?? "updated_at";

		const { data, error } = await baseQuery
			.order(sortColumn, { ascending: sort_dir === "asc" })
			.range(offset, offset + limit - 1);

		if (error) {
			logger.error({ error }, "Failed to list sessions");
			throw new Error(`Failed to list sessions: ${error.message}`);
		}

		const total = count || 0;
		const totalPages = Math.ceil(total / limit);
		const hasNext = page < totalPages;
		const hasPrev = page > 1;

		return {
			data: (data as QuerySessionRecord[]) ?? [],
			pagination: {
				page,
				limit,
				total,
				totalPages,
				hasNext,
				hasPrev,
			},
		};
	}

	/**
	 * Updates session metadata (currently only title).
	 */
	async updateSession(
		auth: AuthContext,
		sessionId: string,
		updates: { title?: string },
	): Promise<QuerySessionRecord | null> {
		if (!updates.title) return await this.getSessionBySessionId(auth, sessionId);

		let query = supabase
			.from("query_sessions")
			.update({ title: updates.title })
			.eq("organization_id", auth.organizationId)
			.eq("session_id", sessionId)
			.select()
			.single();

		query = applyTenantFilter(query, auth.tenantId ?? null);

		const { data, error } = await query;
		if (error) {
			logger.error({ error }, "Failed to update session");
			throw new Error(`Failed to update session: ${error.message}`);
		}

		return (data as QuerySessionRecord) ?? null;
	}

	/**
	 * Deletes a session and its turns.
	 */
	async deleteSession(auth: AuthContext, sessionId: string): Promise<boolean> {
		let query = supabase
			.from("query_sessions")
			.delete()
			.eq("organization_id", auth.organizationId)
			.eq("session_id", sessionId);

		query = applyTenantFilter(query, auth.tenantId ?? null);

		const { error } = await query;
		if (error) {
			logger.error({ error }, "Failed to delete session");
			throw new Error(`Failed to delete session: ${error.message}`);
		}

		return true;
	}
}
