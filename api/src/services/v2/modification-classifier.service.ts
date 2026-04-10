import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { buildTelemetry, type TelemetryContext } from "../../lib/telemetry";
import type { SessionTurnContext } from "../../types/session";

const logger = createLogger("v2:modification-classifier");

const modificationClassificationSchema = z.object({
	type: z
		.enum(["date_filter", "sql_modify_light", "sql_modify_full", "full_query"])
		.describe(
			"date_filter: only date/time range changes. sql_modify_light: filter/sort/limit/granularity changes using columns already in the SQL. sql_modify_full: needs new columns, tables, or JOINs not in the current SQL. full_query: completely different question.",
		),
	confidence: z.number().min(0).max(1),
	instruction: z
		.string()
		.describe(
			"The modification instruction extracted from the question, e.g. 'change date range to last 30 days', 'sort by amount desc', 'add customer_name column'",
		),
	date_range: z
		.object({
			from: z.string(),
			to: z.string(),
		})
		.nullable()
		.describe("For date_filter: the extracted date range. Null for other types."),
	reasoning: z.string(),
});

export type ModificationClassification = z.infer<typeof modificationClassificationSchema>;

export async function classifyModification(input: {
	question: string;
	previousSql: string;
	previousQuestion: string;
	conversationHistory?: SessionTurnContext[];
	telemetry?: TelemetryContext;
}): Promise<ModificationClassification> {
	const historyBlock = input.conversationHistory?.length
		? input.conversationHistory
				.slice(-3)
				.map((t, i) => `Turn ${i + 1}: ${t.question}${t.sql ? `\nSQL: ${t.sql}` : ""}`)
				.join("\n\n")
		: "None";

	try {
		const { object } = await generateObject({
			model: openai(config.models.guardrail),
			schema: modificationClassificationSchema,
			experimental_telemetry: buildTelemetry("modification_classifier", input.telemetry, ["nl_to_sql"]),
			system: `# Role
You are a modification classifier for a text-to-SQL system.

# Task
Given a follow-up question and the previous SQL query, classify what pipeline should handle it.

# Categories
- date_filter: ONLY the date/time range changes. SQL structure is identical.
- sql_modify_light: Targeted change (filter, sort, limit, time granularity) using columns/tables ALREADY in the previous SQL. No new schema context needed.
- sql_modify_full: Change requires columns, tables, or JOINs NOT present in the previous SQL. New schema context must be retrieved.
- full_query: Completely different question or topic. Previous SQL is not a useful starting point.

# Decision Rules
1. If ALL referenced concepts exist in the previous SQL -> sql_modify_light
2. If new columns/tables/metrics are mentioned that don't appear in the SQL -> sql_modify_full
3. If only dates/time periods change -> date_filter
4. If the topic is completely different -> full_query
5. When uncertain between light and full -> prefer full (safe: retrieval won't hurt)
6. When uncertain between sql_modify and full_query -> prefer full_query (safe: full pipeline always works)

# Date Range Extraction
For date_filter: extract the target date range as ISO dates relative to today's date.
- "last 30 days" -> from: 30 days ago, to: today
- "this month" -> from: first day of month, to: today
- "January 2025" -> from: 2025-01-01, to: 2025-01-31`,
			prompt: [
				`## Follow-up Question\n${input.question}`,
				`## Previous Question\n${input.previousQuestion}`,
				`## Previous SQL\n\`\`\`sql\n${input.previousSql}\n\`\`\``,
				`## Conversation History\n${historyBlock}`,
				`## Today\n${new Date().toISOString().slice(0, 10)}`,
			].join("\n\n"),
		});

		// Confidence gating: low confidence falls back to full_query
		if (object.confidence < 0.7) {
			logger.info(
				{
					originalType: object.type,
					confidence: object.confidence,
					reasoning: object.reasoning,
				},
				"Low confidence classification, falling back to full_query",
			);
			return {
				...object,
				type: "full_query",
			};
		}

		logger.debug(
			{
				type: object.type,
				confidence: object.confidence,
				instruction: object.instruction,
			},
			"Modification classified",
		);

		return object;
	} catch (error) {
		logger.error({ err: error }, "Modification classifier failed, falling back to full_query");
		return {
			type: "full_query",
			confidence: 0,
			instruction: "",
			reasoning: "Classifier error — falling back to full pipeline",
		};
	}
}
