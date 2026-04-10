import { RunnableLambda } from "@langchain/core/runnables";
import OpenAI from "openai";
import type { Moderation } from "openai/resources/moderations";
import { config } from "../config";

/**
 * Custom error class for moderation failures
 */
export class ModerationError extends Error {
	constructor(
		message: string,
		public readonly categories: Moderation.Categories,
		public readonly categoryScores: Moderation.CategoryScores,
		public readonly flagged: boolean,
	) {
		super(message);
		this.name = "ModerationError";
	}
}

/** Input type for moderation chain - must contain a question */
export interface ModerationInput {
	question: string;
	callbacks?: any[];
	[key: string]: unknown;
}

export class ModerationService {
	private client: OpenAI;
	private model: string;

	constructor() {
		this.client = new OpenAI({
			apiKey: config.openai.apiKey,
		});
		// Use the moderation model from config
		this.model = config.models.moderation;
	}

	/**
	 * LangChain Runnable chain for content moderation
	 * Checks if the input violates OpenAI's usage policies
	 * Throws ModerationError if content is flagged
	 */
	public moderationChain = RunnableLambda.from(
		async <T extends ModerationInput>(input: T): Promise<T> => {
			const question = input.question;

			if (!question || typeof question !== "string") {
				throw new Error("Input must contain a 'question' field of type string");
			}

			try {
				// Call OpenAI moderation API
				const moderationResponse = await this.client.moderations.create({
					model: this.model,
					input: question,
				});

				const result = moderationResponse.results[0];

				if (!result) {
					throw new Error("No moderation result returned from OpenAI");
				}

				// If content is flagged, throw ModerationError
				if (result.flagged) {
					const flaggedCategories = Object.entries(result.categories)
						.filter(([_, flagged]) => flagged)
						.map(([category]) => category);

					throw new ModerationError(
						`Content violates usage policies. Flagged categories: ${flaggedCategories.join(", ")}`,
						result.categories,
						result.category_scores,
						result.flagged,
					);
				}

				// If content passes moderation, return input unchanged (passthrough)
				return input;
			} catch (error) {
				// Re-throw ModerationError as-is
				if (error instanceof ModerationError) {
					throw error;
				}

				// Wrap other errors
				throw new Error(
					`Moderation check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		},
	);

	/**
	 * Legacy method for direct moderation checks
	 * Returns moderation result without throwing
	 */
	async check(question: string): Promise<{
		flagged: boolean;
		categories?: string[];
		categoryScores?: Moderation.CategoryScores;
	}> {
		try {
			const moderationResponse = await this.client.moderations.create({
				model: this.model,
				input: question,
			});

			const result = moderationResponse.results[0];

			if (!result) {
				throw new Error("No moderation result returned from OpenAI");
			}

			const flaggedCategories = Object.entries(result.categories)
				.filter(([_, flagged]) => flagged)
				.map(([category]) => category);

			return {
				flagged: result.flagged,
				categories: flaggedCategories,
				categoryScores: result.category_scores,
			};
		} catch (error) {
			throw new Error(
				`Moderation check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
