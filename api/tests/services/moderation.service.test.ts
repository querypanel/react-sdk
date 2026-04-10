import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
	ModerationService,
	ModerationError,
} from "../../src/services/moderation.service";

describe("ModerationService", () => {
	let service: ModerationService;

	beforeEach(() => {
		service = new ModerationService();
	});

	describe("moderationChain", () => {
		test("allows safe content", async () => {
			// Mock the OpenAI client to return safe content
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [
								{
									flagged: false,
									categories: {
										violence: false,
										hate: false,
										sexual: false,
										"self-harm": false,
									},
									category_scores: {
										violence: 0.01,
										hate: 0.01,
										sexual: 0.01,
										"self-harm": 0.01,
									},
								},
							],
						}),
					),
				},
			};

			const input = { question: "Show me all users", tenantId: "test" };
			const result = await service.moderationChain.invoke(input);

			expect(result).toEqual(input);
		});

		test("throws ModerationError for flagged content", async () => {
			// Mock the OpenAI client to return flagged content
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [
								{
									flagged: true,
									categories: {
										violence: true,
										hate: false,
										sexual: false,
										"self-harm": false,
									},
									category_scores: {
										violence: 0.95,
										hate: 0.01,
										sexual: 0.01,
										"self-harm": 0.01,
									},
								},
							],
						}),
					),
				},
			};

			const input = { question: "violent content", tenantId: "test" };

			await expect(service.moderationChain.invoke(input)).rejects.toThrow(
				ModerationError,
			);
		});

		test("throws error for missing question field", async () => {
			const input = { tenantId: "test" } as any;

			await expect(service.moderationChain.invoke(input)).rejects.toThrow(
				"Input must contain a 'question' field of type string",
			);
		});

		test("throws error for non-string question", async () => {
			const input = { question: 123, tenantId: "test" } as any;

			await expect(service.moderationChain.invoke(input)).rejects.toThrow(
				"Input must contain a 'question' field of type string",
			);
		});

		test("throws error when no moderation result returned", async () => {
			// Mock the OpenAI client to return empty results
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [],
						}),
					),
				},
			};

			const input = { question: "test", tenantId: "test" };

			await expect(service.moderationChain.invoke(input)).rejects.toThrow(
				"No moderation result returned from OpenAI",
			);
		});

		test("wraps other errors appropriately", async () => {
			// Mock the OpenAI client to throw an error
			(service as any).client = {
				moderations: {
					create: mock(() => Promise.reject(new Error("API error"))),
				},
			};

			const input = { question: "test", tenantId: "test" };

			await expect(service.moderationChain.invoke(input)).rejects.toThrow(
				"Moderation check failed: API error",
			);
		});

		test("includes flagged categories in error message", async () => {
			// Mock the OpenAI client to return multiple flagged categories
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [
								{
									flagged: true,
									categories: {
										violence: true,
										hate: true,
										sexual: false,
										"self-harm": false,
									},
									category_scores: {
										violence: 0.95,
										hate: 0.85,
										sexual: 0.01,
										"self-harm": 0.01,
									},
								},
							],
						}),
					),
				},
			};

			const input = { question: "flagged content", tenantId: "test" };

			try {
				await service.moderationChain.invoke(input);
				expect(false).toBe(true); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(ModerationError);
				if (error instanceof ModerationError) {
					expect(error.message).toContain("violence");
					expect(error.message).toContain("hate");
					expect(error.flagged).toBe(true);
					expect(error.categories.violence).toBe(true);
					expect(error.categories.hate).toBe(true);
				}
			}
		});
	});

	describe("check()", () => {
		test("returns flagged false for safe content", async () => {
			// Mock the OpenAI client to return safe content
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [
								{
									flagged: false,
									categories: {
										violence: false,
										hate: false,
										sexual: false,
										"self-harm": false,
									},
									category_scores: {
										violence: 0.01,
										hate: 0.01,
										sexual: 0.01,
										"self-harm": 0.01,
									},
								},
							],
						}),
					),
				},
			};

			const result = await service.check("Show me all users");

			expect(result.flagged).toBe(false);
			expect(result.categories).toEqual([]);
		});

		test("returns flagged true with categories for unsafe content", async () => {
			// Mock the OpenAI client to return flagged content
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [
								{
									flagged: true,
									categories: {
										violence: true,
										hate: false,
										sexual: false,
										"self-harm": false,
									},
									category_scores: {
										violence: 0.95,
										hate: 0.01,
										sexual: 0.01,
										"self-harm": 0.01,
									},
								},
							],
						}),
					),
				},
			};

			const result = await service.check("violent content");

			expect(result.flagged).toBe(true);
			expect(result.categories).toContain("violence");
			expect(result.categoryScores).toBeDefined();
			expect(result.categoryScores?.violence).toBe(0.95);
		});

		test("throws error when no result returned", async () => {
			// Mock the OpenAI client to return empty results
			(service as any).client = {
				moderations: {
					create: mock(() =>
						Promise.resolve({
							results: [],
						}),
					),
				},
			};

			await expect(service.check("test")).rejects.toThrow(
				"No moderation result returned from OpenAI",
			);
		});

		test("wraps errors appropriately", async () => {
			// Mock the OpenAI client to throw an error
			(service as any).client = {
				moderations: {
					create: mock(() => Promise.reject(new Error("Network error"))),
				},
			};

			await expect(service.check("test")).rejects.toThrow(
				"Moderation check failed: Network error",
			);
		});
	});

	describe("ModerationError", () => {
		test("creates error with correct properties", () => {
			const categories = {
				violence: true,
				hate: false,
			} as any;

			const scores = {
				violence: 0.9,
				hate: 0.1,
			} as any;

			const error = new ModerationError("Test error", categories, scores, true);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ModerationError);
			expect(error.name).toBe("ModerationError");
			expect(error.message).toBe("Test error");
			expect(error.categories).toEqual(categories);
			expect(error.categoryScores).toEqual(scores);
			expect(error.flagged).toBe(true);
		});
	});
});
