import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { buildTelemetry, type TelemetryContext } from "../../lib/telemetry";

const logger = createLogger("v2:intent");

/**
 * The intent classification for a user question.
 */
export const intentSchema = z.object({
	intent: z
		.enum([
			"simple_lookup",
			"aggregation",
			"trend_analysis",
			"comparison",
			"filtering",
			"join_query",
			"clarification_needed",
		])
		.describe("The high-level query type. Use 'clarification_needed' only when the question is too vague to generate SQL."),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("How certain you are about the plan. Lower when ambiguities exist."),
	plan: z.object({
		tables: z.array(z.string()).describe("Table names needed, derived from the schema context"),
		operations: z
			.array(z.string())
			.describe("SQL operations required, e.g. 'GROUP BY decline_reason', 'JOIN orders ON …', 'COUNT(*)'"),
		filters: z
			.array(z.string())
			.describe("WHERE conditions described in plain English, e.g. 'state equals DECLINE', 'created in last 7 days'"),
		orderBy: z.string().nullable().describe("Ordering expression if the question implies sorting, else null"),
		limit: z.number().nullable().describe("Row limit if implied by the question, else null"),
	}),
	ambiguities: z
		.array(
			z.object({
				issue: z.string().describe("What is ambiguous in the question"),
				suggestion: z.string().describe("How the user could clarify"),
			}),
		)
		.describe("Ambiguities found. Empty array if the question is clear."),
	rewrittenQuestion: z
		.string()
		.describe("The question rewritten as a standalone query with pronouns and references from history resolved. Return unchanged if already standalone."),
});

export type IntentResult = z.infer<typeof intentSchema>;

/**
 * Classifies the user question, builds a query plan, and detects ambiguities.
 *
 * Uses Vercel AI SDK `generateObject` for structured output instead of
 * prompt → LLM → StringOutputParser → JSON.parse that the v1 pipeline uses.
 */
export async function classifyIntent(input: {
	question: string;
	schemaContext?: string;
	conversationHistory?: Array<{
		question: string;
		sql?: string | null;
		rationale?: string | null;
		created_at?: string | null;
	}>;
	telemetry?: TelemetryContext;
}): Promise<IntentResult> {
	const historyBlock = formatHistory(input.conversationHistory);

	const { object } = await generateObject({
		model: openai(config.models.guardrail),
		schema: intentSchema,
		system: `# Role
You are a query planner for a text-to-SQL analytics system. You produce a structured plan that a downstream SQL generator will follow.

# Task
Given a natural-language question (with optional schema overview and conversation history), classify the intent, build an execution plan, and flag any ambiguities.

# Instructions

## Intent Classification
Classify the question into one of: simple_lookup, aggregation, trend_analysis, comparison, filtering, join_query, or clarification_needed.
- Use "clarification_needed" ONLY when the question is so vague that generating SQL would almost certainly fail (e.g. "show me the thing", "what about it").
- Minor ambiguities do NOT warrant "clarification_needed" — note them in the ambiguities array instead.

## Query Plan
- \`tables\`: Derive table names from the schema context. Never invent tables.
- \`operations\`: List specific SQL operations needed (e.g. "GROUP BY decline_reason", "COUNT(*)", "JOIN orders ON customer_id").
- \`filters\`: Describe WHERE conditions in plain English (e.g. "state equals DECLINE", "created in last 7 days").
- \`orderBy\` / \`limit\`: Include only if the question implies ordering or a row limit.

## Ambiguities
Flag anything unclear: unspecified date range, ambiguous metric ("sales" = revenue or count?), vague column reference, missing aggregation level. If the question is clear, return an empty array.

## Question Rewriting
Resolve pronouns and references from conversation history into a standalone question. If the question is already standalone, return it unchanged.

## Confidence
Score 0-1. Lower the score when ambiguities exist or the schema does not clearly support the question.`,
		prompt: [
			`## Question\n${input.question}`,
			`## Conversation History\n${historyBlock}`,
			`## Available Schema\n${input.schemaContext ?? "No schema available — plan based on the question alone."}`,
		].join("\n\n"),
		experimental_telemetry: buildTelemetry("intent_classification", input.telemetry, ["nl_to_sql"]),
	});

	logger.debug(
		{
			intent: object.intent,
			confidence: object.confidence,
			ambiguityCount: object.ambiguities.length,
			tables: object.plan.tables,
		},
		"Intent classified",
	);

	return object;
}

function formatHistory(
	history?: Array<{
		question: string;
		sql?: string | null;
		rationale?: string | null;
		created_at?: string | null;
	}>,
): string {
	if (!history?.length) return "None";
	return history
		.slice(-3)
		.map((turn, i) => {
			const parts = [`Turn ${i + 1} - Q: ${turn.question}`];
			if (turn.rationale) parts.push(`  Rationale: ${turn.rationale}`);
			if (turn.sql) parts.push(`  SQL: ${turn.sql}`);
			return parts.join("\n");
		})
		.join("\n\n");
}
