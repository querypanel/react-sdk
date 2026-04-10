import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import type { CallbackHandler } from "@langfuse/langchain";
import { config } from "../config";
import type { SessionTurnContext } from "../types/session";

/**
 * Input for the query rewriter
 */
export interface QueryRewriterInput {
	question: string;
	organizationId: string;
	conversationHistory?: SessionTurnContext[];
	callbacks?: CallbackHandler[];
	[key: string]: unknown;
}

/**
 * Output from the query rewriter - includes the rewritten standalone question
 */
export type QueryRewriterOutput<T extends QueryRewriterInput> = T & {
	rewrittenQuestion: string;
};

/**
 * Service that rewrites follow-up questions into standalone, self-contained questions.
 * This improves RAG retrieval by resolving pronouns and references from conversation history.
 */
export class QueryRewriterService {
	private model: ChatOpenAI;
	private rewriteChain: RunnableSequence<Record<string, string>, string>;

	constructor() {
		this.model = new ChatOpenAI({
			openAIApiKey: config.openai.apiKey,
			modelName: config.models.queryRewriter,
			temperature: 0,
		});

		const prompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				[
					"You are a query rewriter for a text-to-SQL system.",
					"Your task is to rewrite follow-up questions into standalone, self-contained questions.",
					"",
					"Rules:",
					"- Resolve all pronouns (it, they, them, this, that, etc.) to their actual referents from history",
					"- Replace references like 'the same', 'that table', 'those results' with explicit names",
					"- Keep the semantic meaning identical - do not add or remove intent",
					"- If the question is already standalone (no history or no references), return it unchanged",
					"- Output ONLY the rewritten question, nothing else",
					"- Do not add explanations or metadata",
				].join("\n"),
			],
			[
				"human",
				[
					"Conversation history:",
					"{conversation_history}",
					"",
					"Current question: {question}",
					"",
					"Rewritten standalone question:",
				].join("\n"),
			],
		]);

		this.rewriteChain = RunnableSequence.from([
			prompt,
			this.model,
			new StringOutputParser(),
		]);
	}

	/**
	 * LangChain Runnable chain for query rewriting.
	 * Transforms follow-up questions into standalone questions for better RAG retrieval.
	 */
	public rewriteChainRunnable = RunnableLambda.from(
		async <T extends QueryRewriterInput>(
			input: T,
		): Promise<QueryRewriterOutput<T>> => {
			const rewrittenQuestion = await this.rewrite(
				input.question,
				input.conversationHistory,
				input.callbacks,
			);
			return {
				...input,
				rewrittenQuestion,
			};
		},
	);

	/**
	 * Formats conversation history for the prompt
	 */
	private formatConversationHistory(turns?: SessionTurnContext[]): string {
		if (!turns?.length) return "No previous conversation.";

		// Only include the last 3 turns to keep context focused
		const recentTurns = turns.slice(-3);

		return recentTurns
			.map((turn, index) => {
				const parts = [`Turn ${index + 1}:`];
				parts.push(`Q: ${turn.question}`);
				if (turn.sql) {
					// Include just a hint about what was queried, not the full SQL
					parts.push(`(Generated SQL query for this question)`);
				}
				return parts.join("\n");
			})
			.join("\n\n");
	}

	/**
	 * Rewrites a question to be standalone by resolving references from conversation history.
	 * If no history is provided or the question appears standalone, returns it unchanged.
	 */
	async rewrite(
		question: string,
		conversationHistory?: SessionTurnContext[],
		callbacks?: CallbackHandler[],
	): Promise<string> {
		// If no history, return the question unchanged
		if (!conversationHistory?.length) {
			return question;
		}

		const formattedHistory = this.formatConversationHistory(conversationHistory);

		const response = await this.rewriteChain.invoke(
			{
				question,
				conversation_history: formattedHistory,
			},
			{
				runName: "Query Rewrite",
				callbacks,
				tags: ["query_rewrite"],
				metadata: {
					operation: "Query Rewrite",
					has_history: true,
					history_turns: conversationHistory.length,
				},
			},
		);

		// Clean up the response - remove any quotes or extra whitespace
		const rewritten = response.trim().replace(/^["']|["']$/g, "");

		return rewritten || question;
	}
}
