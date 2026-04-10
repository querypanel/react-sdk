import { test, expect, describe, mock, beforeEach } from "bun:test";

const mockSessionSingle = mock(() => ({ data: null, error: null }));
const mockTurnSingle = mock(() => ({ data: null, error: null }));

const mockSessionQuery = {
	select: mock(function () {
		return this;
	}),
	insert: mock(function () {
		return this;
	}),
	update: mock(function () {
		return this;
	}),
	delete: mock(function () {
		return this;
	}),
	eq: mock(function () {
		return this;
	}),
	is: mock(function () {
		return this;
	}),
	order: mock(function () {
		return this;
	}),
	range: mock(function () {
		return this;
	}),
	ilike: mock(function () {
		return this;
	}),
	gte: mock(function () {
		return this;
	}),
	lte: mock(function () {
		return this;
	}),
	limit: mock(function () {
		return this;
	}),
	maybeSingle: mockSessionSingle,
	single: mockSessionSingle,
};

const mockTurnQuery = {
	select: mock(function () {
		return this;
	}),
	insert: mock(function () {
		return this;
	}),
	eq: mock(function () {
		return this;
	}),
	order: mock(function () {
		return this;
	}),
	limit: mock(function () {
		return this;
	}),
	maybeSingle: mockTurnSingle,
	single: mockTurnSingle,
};

const mockFrom = mock((table: string) => {
	if (table === "query_session_turns") return mockTurnQuery;
	return mockSessionQuery;
});

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { SessionService } from "../../src/services/session.service";
import type { AuthContext } from "../../src/types/auth";

describe("SessionService", () => {
	let service: SessionService;
	let mockAuth: AuthContext;

	const mockSession = {
		id: "session-1",
		session_id: "public-session-1",
		organization_id: "org_123",
		tenant_id: "tenant_123",
		user_id: "user_123",
		title: "Revenue Analysis",
		created_at: "2025-01-01T00:00:00Z",
		updated_at: "2025-01-01T00:00:00Z",
	};

	beforeEach(() => {
		service = new SessionService();
		mockAuth = {
			organizationId: "org_123",
			tenantId: "tenant_123",
			userId: "user_123",
			scopes: ["*"],
			roles: ["admin"],
			method: "jwt",
		};

		mockFrom.mockClear();
		mockSessionSingle.mockReset();
		mockTurnSingle.mockReset();
	});

	test("getOrCreateSession should create when missing", async () => {
		mockSessionSingle.mockResolvedValueOnce({ data: null, error: null });
		mockSessionSingle.mockResolvedValueOnce({ data: mockSession, error: null });

		const session = await service.getOrCreateSession(
			mockAuth,
			"public-session-1",
			{ title: "Revenue Analysis" },
		);

		expect(session).toEqual(mockSession);
		expect(mockSessionQuery.insert).toHaveBeenCalled();
	});

	test("getRecentTurns should return turns in chronological order", async () => {
		mockSessionSingle.mockResolvedValueOnce({ data: mockSession, error: null });

		const turns = [
			{
				id: "turn-2",
				session_id: mockSession.id,
				turn_index: 1,
				question: "Follow up",
				sql: "SELECT 2",
				rationale: null,
				row_count: null,
				fields: null,
				error: null,
				created_at: "2025-01-01T00:01:00Z",
			},
			{
				id: "turn-1",
				session_id: mockSession.id,
				turn_index: 0,
				question: "Initial",
				sql: "SELECT 1",
				rationale: null,
				row_count: null,
				fields: null,
				error: null,
				created_at: "2025-01-01T00:00:00Z",
			},
		];

		mockTurnSingle.mockResolvedValueOnce({ data: null, error: null });
		mockTurnQuery.limit = mock(function () {
			return Promise.resolve({ data: turns, error: null });
		});

		const result = await service.getRecentTurns(mockAuth, "public-session-1", 5);

		expect(result[0].turn_index).toBe(0);
		expect(result[1].turn_index).toBe(1);
	});
});
