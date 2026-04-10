import { describe, expect, test, mock, beforeEach } from "bun:test";
import { QueryRunnerService } from "../../src/services/query-runner.service";
import { ModerationError } from "../../src/services/moderation.service";
import { GuardrailError } from "../../src/services/guardrail.service";
import { RunnableLambda } from "@langchain/core/runnables";

describe("QueryRunnerService", () => {
	let service: QueryRunnerService;
	let mockModeration: any;
	let mockGuardrail: any;
	let mockRewriter: any;
	let mockSchemaStorage: any;
	let mockRetriever: any;
	let mockGenerator: any;
	let mockValidator: any;

	beforeEach(() => {
		// Create mock retrieve function
		const mockRetrieve = mock(() =>
			Promise.resolve({
				chunks: [
					{
						source: "table_overview",
						pageContent: "users table with id, name, email columns",
						metadata: { table: "users", dialect: "postgres" },
					},
				],
				primaryTable: "users",
				dialect: "postgres",
			}),
		);

		// Create mock services with proper RunnableLambda chains
		mockModeration = {
			moderationChain: RunnableLambda.from(
				mock((input: any) => Promise.resolve(input)),
			),
		};

		mockGuardrail = {
			enforce: mock(() =>
				Promise.resolve({ allowed: true, reason: null, threat_type: null }),
			),
		};

		// Mock rewriter - returns question unchanged by default (simulates standalone question)
		mockRewriter = {
			rewrite: mock((question: string) => Promise.resolve(question)),
		};

		mockSchemaStorage = {
			getLatestSchema: mock(() => Promise.resolve(null)),
		};

		mockRetriever = {
			retrieve: mockRetrieve,
			retrieveTableOverview: mock(() =>
				Promise.resolve("users table with id, name, email columns"),
			),
			retrievalChain: RunnableLambda.from(async (input: any) => {
				const retrieval = await mockRetrieve(
					input.question,
					input.organizationId,
				);
				return {
					...input,
					retrieval,
				};
			}),
			tableOverviewChain: RunnableLambda.from(async (input: any) => {
				const schemaContext = await mockRetriever.retrieveTableOverview(
					input.question,
					input.organizationId,
				);
				return {
					...input,
					schemaContext,
				};
			}),
		};

		mockGenerator = {
			generate: mock(() =>
				Promise.resolve({
					sql: "SELECT * FROM users",
					params: [],
					dialect: "postgres",
					rationale: "Simple select query",
				}),
			),
			repair: mock(() =>
				Promise.resolve({
					sql: "SELECT id, name FROM users",
					params: [],
					dialect: "postgres",
					rationale: "Fixed query based on error",
				}),
			),
		};

		mockValidator = {
			validate: mock(() => {
				// Does nothing if valid, throws if invalid
			}),
			ensureLimit: mock((sql: string) => sql),
			validationChain: {
				invoke: mock((input: any) =>
					Promise.resolve({ ...input, validated: true }),
				),
			},
		};

		// Create service with mocked dependencies - this will execute the actual chain
		service = new QueryRunnerService(
			mockModeration,
			mockGuardrail,
			mockRewriter,
			mockSchemaStorage,
			mockRetriever,
			mockGenerator,
			mockValidator,
		);
	});

	describe("run() - happy path", () => {
		test("successfully generates SQL for valid question", async () => {
			const result = await service.run("Show me all users", "tenant_123");

			expect(result.sql).toBe("SELECT * FROM users");
			expect(result.params).toEqual([]);
			expect(result.dialect).toBe("postgres");
			expect(result.context).toBeDefined();
			expect(result.context.length).toBeGreaterThan(0);
		});

		test("passes question through moderation chain", async () => {
			const result = await service.run("Show me all users", "tenant_123");

			// Moderation passes through - verify by checking we got a result
			expect(result).toBeDefined();
			expect(result.sql).toBeDefined();
		});

		test("checks guardrails after moderation", async () => {
			await service.run("Show me all users", "tenant_123");

			expect(mockGuardrail.enforce).toHaveBeenCalledWith(
				"Show me all users",
				"users table with id, name, email columns",
				undefined, // callbacks
			);
		});

		test("retrieves context after guardrail check", async () => {
			await service.run("Show me all users", "tenant_123");

			expect(mockRetriever.retrieve).toHaveBeenCalled();
		});

		test("generates SQL with context", async () => {
			await service.run("Show me all users", "tenant_123");

			expect(mockGenerator.generate).toHaveBeenCalled();
			const callArgs = mockGenerator.generate.mock.calls[0][0];
			expect(callArgs.question).toBe("Show me all users");
			expect(callArgs.contextChunks).toBeDefined();
		});

		test("validates generated SQL", async () => {
			await service.run("Show me all users", "tenant_123");

			expect(mockValidator.validate).toHaveBeenCalledWith(
				"SELECT * FROM users",
			);
		});
	});

	describe("run() - moderation failures", () => {
		test("throws ModerationError when content violates policies", async () => {
			mockModeration.moderationChain.invoke = mock(() =>
				Promise.reject(
					new ModerationError(
						"Content violates policies",
						{ violence: true, hate: false } as any,
						{ violence: 0.9, hate: 0.1 } as any,
						true,
					),
				),
			);

			await expect(
				service.run("violent content", "tenant_123"),
			).rejects.toThrow(ModerationError);
		});

		test("does not call guardrail or other services when moderation fails", async () => {
			mockModeration.moderationChain.invoke = mock(() =>
				Promise.reject(
					new ModerationError(
						"Content violates policies",
						{ violence: true, hate: false } as any,
						{ violence: 0.9, hate: 0.1 } as any,
						true,
					),
				),
			);

			try {
				await service.run("violent content", "tenant_123");
			} catch (error) {
				// Expected
			}

			expect(mockGuardrail.enforce).not.toHaveBeenCalled();
			expect(mockGenerator.generate).not.toHaveBeenCalled();
		});
	});

	describe("run() - guardrail failures", () => {
		test("throws GuardrailError when question is irrelevant", async () => {
			mockGuardrail.enforce = mock(() =>
				Promise.resolve({
					allowed: false,
					reason: "Question is not related to database querying",
					threat_type: "irrelevant",
				}),
			);

			await expect(
				service.run("What's the weather?", "tenant_123"),
			).rejects.toThrow(GuardrailError);
		});

		test("throws GuardrailError for SQL injection attempts", async () => {
			mockGuardrail.enforce = mock(() =>
				Promise.resolve({
					allowed: false,
					reason: "Question contains SQL injection patterns",
					threat_type: "sql_injection",
				}),
			);

			await expect(
				service.run("Show users; DROP TABLE users--", "tenant_123"),
			).rejects.toThrow(GuardrailError);
		});

		test("does not call generator when guardrail fails", async () => {
			mockGuardrail.enforce = mock(() =>
				Promise.resolve({
					allowed: false,
					reason: "Blocked",
					threat_type: "irrelevant",
				}),
			);

			try {
				await service.run("What's the weather?", "tenant_123");
			} catch (error) {
				// Expected
			}

			expect(mockGenerator.generate).not.toHaveBeenCalled();
		});
	});

	describe("run() - SQL validation failures", () => {
		test("throws error when SQL validation fails", async () => {
			mockValidator.validate = mock(() => {
				throw new Error("Queries must not include semicolons.");
			});

			await expect(service.run("Show me users", "tenant_123")).rejects.toThrow(
				"Queries must not include semicolons.",
			);
		});

		test("validates before returning result", async () => {
			let validatorCalled = false;
			mockValidator.validate = mock(() => {
				validatorCalled = true;
			});

			await service.run("Show me users", "tenant_123");

			expect(validatorCalled).toBe(true);
		});
	});

	describe("run() - repair flow", () => {
		test("uses repair chain when lastError is provided", async () => {
			const result = await service.run(
				"Show me users",
				"tenant_123",
				undefined,
				"column 'email' does not exist",
				"SELECT email FROM users",
			);

			expect(mockGenerator.repair).toHaveBeenCalled();
			expect(result.sql).toBe("SELECT id, name FROM users");
		});

		test("passes error context to repair chain", async () => {
			await service.run(
				"Show me users",
				"tenant_123",
				undefined,
				"column 'email' does not exist",
				"SELECT email FROM users",
			);

			const repairArgs = mockGenerator.repair.mock.calls[0][0];
			expect(repairArgs.question).toBe("Show me users");
			expect(repairArgs.previousSql).toBe("SELECT email FROM users");
			expect(repairArgs.error).toBe("column 'email' does not exist");
		});

		test("runs moderation and guardrail checks in repair flow", async () => {
			const result = await service.run(
				"Show me users",
				"tenant_123",
				undefined,
				"column 'email' does not exist",
				"SELECT email FROM users",
			);

			// Verify moderation and guardrail passed by checking result
			expect(result).toBeDefined();
			expect(mockGuardrail.enforce).toHaveBeenCalled();
		});

		test("validates repaired SQL", async () => {
			await service.run(
				"Show me users",
				"tenant_123",
				undefined,
				"column 'email' does not exist",
				"SELECT email FROM users",
			);

			expect(mockValidator.validate).toHaveBeenCalledWith(
				"SELECT id, name FROM users",
			);
		});

		test("throws error when repair flow moderation fails", async () => {
			mockModeration.moderationChain.invoke = mock(() =>
				Promise.reject(
					new ModerationError(
						"Content violates policies",
						{ violence: true, hate: false } as any,
						{ violence: 0.9, hate: 0.1 } as any,
						true,
					),
				),
			);

			await expect(
				service.run(
					"violent content",
					"tenant_123",
					undefined,
					"some error",
					"SELECT * FROM users",
				),
			).rejects.toThrow(ModerationError);
		});

		test("throws error when repair flow guardrail fails", async () => {
			mockGuardrail.enforce = mock(() =>
				Promise.resolve({
					allowed: false,
					reason: "Blocked",
					threat_type: "irrelevant",
				}),
			);

			await expect(
				service.run(
					"What's the weather?",
					"tenant_123",
					undefined,
					"some error",
					"SELECT * FROM users",
				),
			).rejects.toThrow(GuardrailError);
		});
	});
});
