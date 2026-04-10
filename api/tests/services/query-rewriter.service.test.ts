import { describe, expect, test, mock, beforeEach } from "bun:test";
import { QueryRewriterService } from "../../src/services/query-rewriter.service";
import type { SessionTurnContext } from "../../src/types/session";

describe("QueryRewriterService", () => {
	let service: QueryRewriterService;

	beforeEach(() => {
		service = new QueryRewriterService();
	});

	describe("rewrite", () => {
		test("returns question unchanged when no history provided", async () => {
			const question = "Show me all orders from last month";
			const result = await service.rewrite(question, undefined);
			expect(result).toBe(question);
		});

		test("returns question unchanged when history is empty", async () => {
			const question = "Show me all orders from last month";
			const result = await service.rewrite(question, []);
			expect(result).toBe(question);
		});

		test("rewrites follow-up question with history context", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Show me the total sales for customers in New York"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{
					question: "Show me total sales by customer",
					sql: "SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id",
					rationale: "Aggregated sales per customer",
				},
			];

			const result = await service.rewrite(
				"Now filter that for New York",
				history,
			);

			expect(result).toBe("Show me the total sales for customers in New York");
			expect(mockInvoke).toHaveBeenCalled();

			// Verify the prompt includes history
			const callArgs = mockInvoke.mock.calls[0][0];
			expect(callArgs).toHaveProperty("question", "Now filter that for New York");
			expect(callArgs.conversation_history).toContain("Turn 1:");
			expect(callArgs.conversation_history).toContain(
				"Show me total sales by customer",
			);
		});

		test("resolves pronouns from conversation history", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Show me the average order value for premium customers"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{
					question: "List all premium customers",
					sql: "SELECT * FROM customers WHERE tier = 'premium'",
				},
			];

			const result = await service.rewrite(
				"What's their average order value?",
				history,
			);

			expect(result).toBe(
				"Show me the average order value for premium customers",
			);
			expect(mockInvoke).toHaveBeenCalled();
		});

		test("only uses last 3 turns of history", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Updated question"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{ question: "Turn 1 question" },
				{ question: "Turn 2 question" },
				{ question: "Turn 3 question" },
				{ question: "Turn 4 question" },
				{ question: "Turn 5 question" },
			];

			await service.rewrite("Current question", history);

			const callArgs = mockInvoke.mock.calls[0][0];
			// Should only include turns 3, 4, 5 (last 3)
			expect(callArgs.conversation_history).not.toContain("Turn 1 question");
			expect(callArgs.conversation_history).not.toContain("Turn 2 question");
			expect(callArgs.conversation_history).toContain("Turn 3 question");
			expect(callArgs.conversation_history).toContain("Turn 4 question");
			expect(callArgs.conversation_history).toContain("Turn 5 question");
		});

		test("passes callbacks for Langfuse tracing", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Rewritten question"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const mockCallback = { handleLLMStart: mock() } as any;
			const history: SessionTurnContext[] = [
				{ question: "Previous question" },
			];

			await service.rewrite("Current question", history, [mockCallback]);

			expect(mockInvoke).toHaveBeenCalled();
			// Verify callbacks were passed in the config
			const callConfig = mockInvoke.mock.calls[0][1];
			expect(callConfig).toHaveProperty("callbacks", [mockCallback]);
			expect(callConfig).toHaveProperty("runName", "Query Rewrite");
			expect(callConfig).toHaveProperty("tags", ["query_rewrite"]);
		});

		test("cleans up quoted responses", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve('"Show me all orders"'),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{ question: "Previous question" },
			];

			const result = await service.rewrite("Current question", history);

			expect(result).toBe("Show me all orders");
		});

		test("returns original question if rewrite is empty", async () => {
			const mockInvoke = mock(() => Promise.resolve("   "));
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{ question: "Previous question" },
			];

			const result = await service.rewrite("Current question", history);

			expect(result).toBe("Current question");
		});

		test("includes SQL generation hint in history format", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Rewritten question"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const history: SessionTurnContext[] = [
				{
					question: "Show me orders",
					sql: "SELECT * FROM orders",
				},
			];

			await service.rewrite("Current question", history);

			const callArgs = mockInvoke.mock.calls[0][0];
			expect(callArgs.conversation_history).toContain(
				"Generated SQL query for this question",
			);
		});
	});

	describe("rewriteChainRunnable", () => {
		test("adds rewrittenQuestion to output", async () => {
			const mockInvoke = mock(() =>
				Promise.resolve("Standalone version of the question"),
			);
			(service as any).rewriteChain = { invoke: mockInvoke };

			const input = {
				question: "Show me the same for last week",
				organizationId: "org-123",
				conversationHistory: [
					{
						question: "Total orders this month",
						sql: "SELECT COUNT(*) FROM orders WHERE created_at > '2024-01-01'",
					},
				] as SessionTurnContext[],
			};

			const result = await service.rewriteChainRunnable.invoke(input);

			expect(result.rewrittenQuestion).toBe(
				"Standalone version of the question",
			);
			expect(result.question).toBe("Show me the same for last week");
			expect(result.organizationId).toBe("org-123");
		});
	});
});
