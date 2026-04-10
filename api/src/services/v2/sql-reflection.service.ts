import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { config } from "../../config";
import { isExactOrNearGoldSqlMatch } from "../../lib/gold-sql-match";
import { createLogger } from "../../lib/logger";
import { buildTelemetry, type TelemetryContext } from "../../lib/telemetry";
import type { ContextChunk, GeneratedQuery } from "../../types/query";
import type { SchemaLinkingResult } from "./schema-linker.service";
import { normalizeDateTimeParams } from "./sql-generator-v2.service";

const logger = createLogger("v2:sql-reflection");

const reflectionSchema = z.object({
	isCorrect: z
		.boolean()
		.describe("true if the SQL correctly answers the question (minor warnings are OK). false only for errors that produce wrong results or fail execution."),
	issues: z.array(
		z.object({
			severity: z.enum(["error", "warning"]).describe("error = wrong results or execution failure; warning = suboptimal but functional"),
			description: z.string().describe("What is wrong and which part of the SQL is affected"),
			fix: z.string().nullable().describe("Concrete fix for errors; null for warnings"),
		}),
	).describe("All issues found, ordered by severity (errors first)"),
	correctedSql: z
		.string()
		.nullable()
		.describe("The corrected SQL query when isCorrect=false. Must be a minimal fix — do not restructure the whole query. Null when isCorrect=true."),
	correctedParams: z
		.array(
			z.object({
				name: z.string().describe("Parameter name matching the placeholder"),
				value: z.union([z.string(), z.number(), z.boolean()]).describe("The literal value to bind"),
				description: z.string().nullable(),
			}),
		)
		.nullable()
		.describe("Updated params when correctedSql is provided. Null otherwise."),
	correctedRationale: z
		.string()
		.nullable()
		.describe(
			"User-facing rationale for the corrected SQL. Write as if the corrected query was the original — explain the approach and columns used to answer the question. NEVER mention corrections, fixes, errors, or replaced functions.",
		),
});

export type ReflectionResult = z.infer<typeof reflectionSchema>;

/**
 * SQL self-reflection: an LLM reviews the generated SQL against the
 * original question and schema context to catch semantic errors that
 * regex validation cannot detect.
 *
 * Catches:
 * - Wrong table or column references
 * - Incorrect JOIN conditions
 * - Missing or wrong aggregation
 * - Mismatched GROUP BY / SELECT
 * - Wrong date calculations
 * - Missing tenant isolation filter
 */
export async function reflectOnSql(input: {
	question: string;
	/** Original user question before intent rewriting, used for gold SQL exact match detection */
	originalQuestion?: string;
	sql: string;
	params: Array<Record<string, unknown>>;
	rationale?: string;
	contextChunks: ContextChunk[];
	schemaLinking?: SchemaLinkingResult;
	dialect?: string;
	tenantFieldName?: string;
	enforceTenantIsolation?: boolean;
	timeColumns?: string[];
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	telemetry?: TelemetryContext;
}): Promise<ReflectionResult> {
	const schemaChunks = input.contextChunks.filter(
		(c) => c.source === "table_overview" || c.source === "column",
	);
	const goldSqlChunks = input.contextChunks.filter(
		(c) => c.source === "gold_sql",
	);

	// Detect exact match between question and gold SQL entry names.
	// Check both the (possibly rewritten) question AND the original question.
	let goldSqlHasExactMatch = false;
	if (goldSqlChunks.length > 0) {
		const questionsToCheck = [input.question, input.originalQuestion].filter(Boolean) as string[];
		for (const chunk of goldSqlChunks) {
			const entryName = chunk.metadata.entry_name as string | undefined;
			if (!entryName) continue;
			if (questionsToCheck.some((q) => isExactOrNearGoldSqlMatch(q, entryName))) {
				goldSqlHasExactMatch = true;
				break;
			}
		}
	}

	const contextSummary = schemaChunks
		.map((c) => {
			const table = c.metadata.table ?? "";
			const column = c.metadata.column ?? "";
			return column
				? `${table}.${column} (${c.metadata.data_type ?? "unknown type"})`
				: `Table: ${table} — ${c.pageContent.slice(0, 120)}`;
		})
		.join("\n");

	const goldSqlLabel = goldSqlHasExactMatch
		? "Gold SQL reference queries (EXACT MATCH — generated SQL must follow this structure):"
		: "Gold SQL reference queries (curated expert examples):";
	const goldSqlSummary = goldSqlChunks.length
		? `\n\n${goldSqlLabel}\n` +
			goldSqlChunks.map((c) => c.pageContent).join("\n---\n")
		: "";

	const linkingSummary = input.schemaLinking
		? [
				"Schema linking results:",
				`  Resolved tables: ${input.schemaLinking.resolvedTables.join(", ")}`,
				`  Linked entities: ${input.schemaLinking.linkedEntities.map((e) => `${e.mention} → ${e.table}${e.column ? "." + e.column : ""}`).join(", ")}`,
				input.schemaLinking.joinHints?.length
					? `  Join hints: ${input.schemaLinking.joinHints.join(", ")}`
					: "",
			]
				.filter(Boolean)
				.join("\n")
		: "";

	const tenantBlock =
		input.enforceTenantIsolation && input.tenantFieldName
			? `\nCRITICAL: Tenant isolation is ENFORCED. The SQL MUST contain a WHERE filter on "${input.tenantFieldName}". If missing, mark as error.`
			: "";

	const dialectSafetyBlock =
		input.dialect?.toLowerCase() === "bigquery"
			? `CRITICAL BigQuery rules:
- Preserve BigQuery Standard SQL exactly.
- Use ONLY named parameters like @start_date or @${input.tenantFieldName ?? "tenant_id"}.
- NEVER use $1, $2, ?, {name:Type}, ILIKE, :: casts, or FROM_UNIXTIME().
- If a time column is STRING, correct it using BigQuery-native parsing/casting such as TIMESTAMP(...), PARSE_TIMESTAMP(...), CAST(... AS TIMESTAMP), SAFE_CAST(...), or DATE(TIMESTAMP(...)) depending on the actual value shape.`
			: "";

	const timeColumnsBlock = input.timeColumns?.length
		? `The only valid date/time columns are: ${input.timeColumns.join(", ")}. If the SQL filters on a date/time column not in this list, mark as error and correct it to use one of these columns.`
		: "";

	const { object } = await generateObject({
		model: openai(config.models.guardrail),
		schema: reflectionSchema,
		system: [
			`# Role
You are a SQL reviewer in a text-to-SQL pipeline. You catch semantic and structural errors that static validation cannot detect.

# Task
Verify that the generated SQL correctly answers the user's question. If it does not, provide a minimal correction.

# Error Categories (check in this order)

1. **Gold SQL deviation** — If gold SQL reference queries are provided that match the question, the generated SQL MUST follow their structure (same columns, GROUP BY, filters). Deviating from a matching gold SQL is an error. If the gold SQL section is marked "EXACT MATCH", any structural deviation from that gold SQL is a critical error — correct the SQL to match.
2. **Semantic errors** — Does the SQL actually answer the question? Are the right columns, aggregations, and groupings used?
3. **Column/table errors** — Does the SQL reference columns or tables that don't exist in the schema?
4. **JOIN errors** — Are JOIN conditions correct? Do joined columns match types?
5. **Aggregation errors** — Is GROUP BY consistent with SELECT? Are aggregate functions correct?
6. **Filter errors** — Do WHERE conditions match what the question asks?
7. **Date errors** — Are date calculations correct for relative references ("last 7 days", "this month")? Use the "Today" date provided in the prompt as the reference point. Date param values must use format "YYYY-MM-DD HH:MM:SS" (no "T" separator, no "Z", no milliseconds).
8. **Missing LIMIT** — Every query MUST have a LIMIT clause (default 100). If missing, mark as error and add LIMIT 100.
9. **Tenant isolation** — If enforced, is the tenant filter present and correct?

# Decision Rules
- \`isCorrect=true\`: The SQL answers the question correctly. Minor style issues → list as warnings.
- \`isCorrect=false\`: The SQL would produce wrong results or fail execution. You MUST provide correctedSql, correctedParams, and correctedRationale.

# Correction Rules
- Make minimal changes — fix the specific error, do not restructure the query.
- \`correctedRationale\` is shown to end users. Write it as if the corrected query was the original. Explain the approach and columns used. NEVER mention corrections, errors, replaced functions, or internal decisions.`,
			formatInjectedSystemPrompt(input.systemPrompt),
		]
			.filter(Boolean)
			.join("\n\n"),
		prompt: [
			`## Question\n${input.question}`,
			`## Dialect\n${input.dialect ?? "ansi"}`,
			dialectSafetyBlock ? `## Dialect Safety\n${dialectSafetyBlock}` : "",
			`## Today\n${new Date().toISOString().slice(0, 10)}`,
			`## Generated SQL\n\`\`\`sql\n${input.sql}\n\`\`\``,
			`## Params\n${JSON.stringify(input.params, null, 2)}`,
			input.rationale ? `## Rationale\n${input.rationale}` : "",
			`## Available Schema\n${contextSummary}`,
			goldSqlSummary ? `## Gold SQL References\n${goldSqlSummary}` : "",
			linkingSummary ? `## Schema Linking\n${linkingSummary}` : "",
			tenantBlock ? `## Tenant Isolation\n${tenantBlock}` : "",
			timeColumnsBlock ? `## Available Date/Time Columns\n${timeColumnsBlock}` : "",
		]
			.filter(Boolean)
			.join("\n\n"),
		experimental_telemetry: buildTelemetry("sql_reflection", input.telemetry, ["nl_to_sql", "reflection"]),
	});

	if (object.isCorrect) {
		logger.debug(
			{ warningCount: object.issues.filter((i) => i.severity === "warning").length },
			"SQL reflection passed",
		);
	} else {
		logger.warn(
			{
				issues: object.issues.map((i) => `[${i.severity}] ${i.description}`),
				hasCorrectedSql: !!object.correctedSql,
			},
			"SQL reflection found errors",
		);
	}

	return object;
}

function formatInjectedSystemPrompt(injected?: string): string {
	const value = typeof injected === "string" ? injected.trim() : "";
	if (!value) return "";
	const clipped = value.length > 8000 ? value.slice(0, 8000) : value;
	return `# Caller System Instructions (customer-configured)
The following instructions come from the calling application (your customer).

PRIORITY:
- When these instructions conflict with generic defaults or guardrails earlier in this prompt, follow the **caller's** instructions.
- Earlier sections are baseline defaults; the customer may relax or replace LIMIT behavior, how tenant filters are applied or validated, correction strictness, and similar policy as they configure their integration.

${clipped}`;
}

/**
 * Strip markdown code fences that LLMs sometimes wrap around SQL output.
 */
function sanitizeSql(sql: string): string {
	let cleaned = sql.trim();
	const fenceMatch = cleaned.match(/^```(?:sql)?\s*\n?([\s\S]*?)\n?\s*```$/);
	if (fenceMatch) {
		cleaned = (fenceMatch[1] ?? cleaned).trim();
	}
	return cleaned;
}

/**
 * Apply reflection results to a GeneratedQuery.
 * If reflection says the SQL is incorrect and provides a correction, use it.
 * Otherwise return the original.
 */
export function applyReflection(
	original: GeneratedQuery,
	reflection: ReflectionResult,
): GeneratedQuery {
	if (reflection.isCorrect || !reflection.correctedSql) {
		return original;
	}

	return {
		sql: sanitizeSql(reflection.correctedSql),
		params: normalizeDateTimeParams(
			(reflection.correctedParams ?? original.params) as Array<Record<string, unknown>>,
		),
		rationale: reflection.correctedRationale ?? original.rationale,
		dialect: original.dialect,
	};
}
