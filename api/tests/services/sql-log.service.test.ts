import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SqlLogService } from "../../src/services/sql-log.service";
import { supabase } from "../../src/lib/supabase";
import type { AuthContext } from "../../src/types/auth";

// Mock supabase client
const mockSupabase = {
	from: mock((table: string) => ({
		insert: mock((data: any) => ({
			select: mock((cols: string) => ({
				single: mock(async () => ({
					data: { id: "test-uuid-123" },
					error: null,
				})),
			})),
		})),
		update: mock((data: any) => ({
			eq: mock((col: string, val: any) => ({
				data: null,
				error: null,
			})),
		})),
		select: mock((cols: string) => ({
			eq: mock((col: string, val: any) => ({
				single: mock(async () => ({
					data: {
						id: "test-uuid-123",
						sql: "SELECT * FROM users",
						state: "DRAFT",
					},
					error: null,
				})),
			})),
		})),
	})),
};

// Replace supabase with mock
Object.assign(supabase, mockSupabase);

describe("SqlLogService", () => {
	let service: SqlLogService;

	beforeEach(() => {
		service = new SqlLogService();
	});

	describe("createDraftLog", () => {
		const mockAuth: AuthContext = {
			method: "jwt",
			organizationId: "org-abc",
			tenantId: "tenant-xyz",
			scopes: ["*"],
			roles: ["admin"],
		};

		test("creates a draft log with all fields", async () => {
			const input = {
				sql: "SELECT * FROM users WHERE id = $1",
				params: [{ value: 123 }],
				question: "Show me user with ID 123",
				dialect: "postgres",
				rationale: "Simple select query",
			};

			const queryId = await service.createDraftLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
			expect(mockSupabase.from).toHaveBeenCalledWith("sql_logs");
		});

		test("creates a draft log without optional fields", async () => {
			const input = {
				sql: "SELECT * FROM users",
				params: [],
				question: "Show all users",
				dialect: "postgres",
			};

			const queryId = await service.createDraftLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
		});

		test("creates a draft log with parent_log_id for repairs", async () => {
			const input = {
				sql: "SELECT * FROM users WHERE active = true",
				params: [],
				question: "Show active users",
				dialect: "postgres",
				parentLogId: "parent-uuid-456",
			};

			const queryId = await service.createDraftLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
		});

		test("creates a draft log with context target identifiers", async () => {
			const input = {
				sql: "SELECT * FROM users WHERE department = 'sales'",
				params: [],
				question: "Show sales team members",
				dialect: "postgres",
				contextTargetIdentifiers: ["users.department", "users.name"],
			};

			const queryId = await service.createDraftLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
			expect(mockSupabase.from).toHaveBeenCalledWith("sql_logs");
		});
	});

	describe("createFailedLog", () => {
		const mockAuth: AuthContext = {
			method: "jwt",
			organizationId: "org-abc",
			tenantId: "tenant-xyz",
			scopes: ["*"],
			roles: ["admin"],
		};

		test("creates a failed log with all fields", async () => {
			const input = {
				sql: "SELECT * FROM invalid_table",
				params: [],
				question: "Show invalid data",
				dialect: "postgres",
				error: "Table does not exist",
			};

			const queryId = await service.createFailedLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
		});

		test("creates a failed log without SQL (generation blocked)", async () => {
			const input = {
				question: "Dangerous query",
				error: "Moderation: Query contains harmful content",
			};

			const queryId = await service.createFailedLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
		});

		test("creates a failed log with context target identifiers", async () => {
			const input = {
				question: "Show invalid data",
				error: "Query execution failed",
				contextTargetIdentifiers: ["users.email", "orders.total"],
			};

			const queryId = await service.createFailedLog(mockAuth, input);

			expect(queryId).toBe("test-uuid-123");
			expect(mockSupabase.from).toHaveBeenCalledWith("sql_logs");
		});
	});

	describe("updateToSuccess", () => {
		test("updates log state to SUCCESS", async () => {
			await service.updateToSuccess("test-uuid-123");

			expect(mockSupabase.from).toHaveBeenCalledWith("sql_logs");
		});
	});

	describe("getLog", () => {
		test("retrieves a log by ID", async () => {
			const log = await service.getLog("test-uuid-123");

			expect(log.id).toBe("test-uuid-123");
			expect(log.sql).toBe("SELECT * FROM users");
			expect(log.state).toBe("DRAFT");
		});
	});
});
