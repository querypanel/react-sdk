import { describe, expect, mock, test } from "bun:test";

// Mock config
mock.module("../../src/config", () => ({
	config: {
		nodeEnv: "test",
		supabase: {
			url: "https://test.supabase.co",
			serviceRoleKey: "test-key",
		},
		openai: {
			apiKey: "test-key",
		},
		mastra: {
			databaseUrl: "postgresql://test:test@localhost:5432/test",
			postgresPoolMax: 5,
			postgresIdleTimeoutMillis: 5000,
		},
		models: {
			sqlGenerator: "gpt-4o-mini",
			chartGenerator: "gpt-4o-mini",
			guardrail: "gpt-4o-mini",
			moderation: "omni-moderation-latest",
		},
		autoEval: {
			enabled: false,
			sampleRate: 0.05,
			judgeModel: "gpt-4o-mini",
			timeoutMs: undefined,
		},
		database: {
			tableName: "schema_chunks",
			queryName: "match_documents",
		},
		auth: {
			serviceApiKey: "test-api-key",
		},
		langfuse: {
			publicKey: undefined,
			secretKey: undefined,
			host: undefined,
			enabled: false,
		},
	},
}));

import { Hono } from "hono";
import { registerQueryV2Routes } from "../../src/routes/query-v2.route";
import { GuardrailError } from "../../src/services/guardrail.service";
import { ModerationError } from "../../src/services/moderation.service";
import { ClarificationNeededError } from "../../src/services/v2/query-runner-v2.service";
import type { AppContext } from "../../src/types/app";
import { createTestAuthMiddleware } from "../helpers/auth.helper";

const createApp = (runImpl: ReturnType<typeof mock>) => {
	const app = new Hono<AppContext>();
	app.use("*", createTestAuthMiddleware());
	registerQueryV2Routes(app, {
		queryRunnerV2: { run: runImpl } as any,
		sqlLogService: {
			createDraftLog: mock(async () => "test-query-id"),
			createFailedLog: mock(async () => "test-failed-id"),
		} as any,
		sessionService: {
			getRecentTurns: mock(async () => []),
			addTurn: mock(async () => undefined),
		} as any,
	});
	return app;
};

describe("POST /v2/query", () => {
	test("returns SQL with trace and intent from runner", async () => {
		const mockRun = mock(async () => ({
			sql: "SELECT id, name FROM orders LIMIT 100",
			params: [],
			dialect: "clickhouse",
			rationale: "demo",
			context: [],
			trace: {
				totalDurationMs: 250,
				steps: [
					{ step: "content_moderation", durationMs: 20 },
					{ step: "intent_recognition", durationMs: 80 },
					{ step: "sql_generation", durationMs: 150 },
				],
			},
			intent: {
				intent: "simple_lookup",
				confidence: 0.95,
				plan: {
					tables: ["orders"],
					operations: ["SELECT"],
					filters: [],
				},
				ambiguities: [],
				rewrittenQuestion: "Show table orders",
			},
		}));

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show table orders",
				system_prompt: "Retention: only last 30 days of data.",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.sql).toBe("SELECT id, name FROM orders LIMIT 100");
		expect(body.trace).toBeDefined();
		expect(body.trace.totalDurationMs).toBe(250);
		expect(body.trace.steps).toHaveLength(3);
		expect(body.intent).toBeDefined();
		expect(body.intent.intent).toBe("simple_lookup");
		expect(body.intent.confidence).toBe(0.95);

		expect(mockRun).toHaveBeenCalledWith(
			"Show table orders",
			"23011c66-b1dd-40f3-bc88-4065c6357d39", // organizationId from test auth middleware
			"3", // tenantId from test auth middleware
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			"Retention: only last 30 days of data.",
			[], // conversation history
			{
				organizationId: "23011c66-b1dd-40f3-bc88-4065c6357d39",
				sessionId: undefined,
				tenantId: "3",
				userId: "dev-user",
			}, // telemetry
			3, // max_retry
			undefined,
		);
	});

	test("returns 422 for clarification needed errors", async () => {
		const mockRun = mock(async () => {
			throw new ClarificationNeededError(
				"Your question needs clarification before I can generate SQL.\n- 'sales' is ambiguous: Do you mean revenue amount or number of transactions?",
				[
					{
						issue: "'sales' is ambiguous",
						suggestion:
							"Do you mean revenue amount or number of transactions?",
					},
				],
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "show me sales",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.code).toBe("CLARIFICATION_NEEDED");
		expect(body.details.ambiguities).toHaveLength(1);
		expect(body.details.ambiguities[0].issue).toBe("'sales' is ambiguous");
	});

	test("returns 400 for guardrail errors", async () => {
		const mockRun = mock(async () => {
			throw new GuardrailError(
				"Question is not related to database querying",
				"irrelevant",
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "weather?",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.details.threat_type).toBe("irrelevant");
	});

	test("returns 400 for moderation errors", async () => {
		const mockRun = mock(async () => {
			throw new ModerationError(
				"Content violates usage policies. Flagged categories: violence",
				{ violence: true, hate: false } as any,
				{ violence: 0.95, hate: 0.01 } as any,
				true,
			);
		});

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "violent content",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toContain("violates usage policies");
		expect(body.details.flagged).toBe(true);
		expect(body.details.categories).toContain("violence");
	});

	test("returns 500 for other errors with pipeline trace", async () => {
		const error = new Error("Database connection failed");
		(error as any).__pipelineTrace = {
			totalDurationMs: 45,
			steps: [{ step: "content_moderation", durationMs: 45 }],
		};
		const mockRun = mock(async () => {
			throw error;
		});

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show users",
			}),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as any;
		expect(body.success).toBe(false);
		expect(body.error).toBe("Database connection failed");
		expect(body.trace).toBeDefined();
		expect(body.trace.totalDurationMs).toBe(45);
	});

	test("accepts repair parameters", async () => {
		const mockRun = mock(async () => ({
			sql: "SELECT id, name FROM users LIMIT 100",
			params: [],
			dialect: "postgres",
			rationale: "Fixed query",
			context: [],
			trace: {
				totalDurationMs: 200,
				steps: [],
			},
		}));

		const app = createApp(mockRun);

		const res = await app.request("/v2/query", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: "Show users",
				last_error: "column 'email' does not exist",
				previous_sql: "SELECT email FROM users",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.sql).toBe("SELECT id, name FROM users LIMIT 100");
	});
});
