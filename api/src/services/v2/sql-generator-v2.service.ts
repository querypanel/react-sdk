import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { config } from "../../config";
import { isExactOrNearGoldSqlMatch } from "../../lib/gold-sql-match";
import { createLogger } from "../../lib/logger";
import { buildTelemetry, type TelemetryContext } from "../../lib/telemetry";
import type { ContextChunk, GeneratedQuery } from "../../types/query";
import type { TenantSettings } from "../schema-storage.service";
import type { SessionTurnContext } from "../../types/session";
import type { IntentResult } from "./intent.service";

const logger = createLogger("v2:sql-generator");

const DIALECT_INSTRUCTIONS: Record<string, string> = {
	postgres: `Use PostgreSQL syntax.
- Use $1, $2, etc. for parameters.
- Use "::" for type casting (e.g. value::text).
- Use ILIKE for case-insensitive string matching.
- Use standard ISO 8601 for dates.
- Use jsonb operators (->, ->>) if querying JSON columns.
- Enclose reserved keywords in double quotes.`,
	bigquery: `Use BigQuery Standard SQL syntax.
- Use named parameters like @start_date, @end_date, @tenant_id.
- NEVER use $1, $2, ?, or {name:Type} placeholders.
- The placeholder name in SQL MUST match the 'name' field in params array exactly.
- Use SAFE_CAST when type coercion may fail.
- When binding DATE values, use ISO date-only strings like "2026-03-30" (not "2026-03-30 23:59:59").
- If the user asks for a trend "over time" and they did not specify a range, use a default time range of **last 1 month** (30 days) based on the provided "Today" date and bind it as parameters.
- If the user **does** specify a date or calendar range, honor it exactly in SQL and params. Do not silently replace it with a different range to "fix" empty results—the agent will ask the user before changing the query.
- CRITICAL: Always reference tables using the exact identifier shape shown in the provided schema context.
  - If schema context shows fully-qualified tables (project.dataset.table), you MUST use that full form (with backticks) in SQL.
  - Do NOT rely on default dataset/project resolution (e.g. avoid using only dataset.table) unless the schema context explicitly uses that exact form.
- Use backticks for fully-qualified identifiers.
- When querying a single table without an alias in FROM, reference columns unqualified (for example, use repository_created_at, not github_timeline.repository_created_at).
- If you qualify columns, you MUST define and use an explicit alias in FROM/JOIN (for example, FROM \`project.dataset.github_timeline\` AS github_timeline).
- Never wrap column references like \`dataset.table.column\` or \`table.column\`.
- Use standard BigQuery date/time functions.
- Prefer fully-qualified identifiers (project.dataset.table) over database.table_name.`,
	clickhouse: `Use ClickHouse SQL syntax.
- Use {name:Type} style placeholders (single braces) where 'name' MUST match the param name exactly.
- Common types: String, Int32, Int64, Float64, DateTime, Date, Array(String), Array(Int32).
- CRITICAL: The placeholder name must match the 'name' field in params array.
- For list queries: ALWAYS include a LIMIT clause (default 100). For aggregations: scope with a time range so the query does not scan unbounded data; for GROUP BY aggregations also include LIMIT.
- Use standard ClickHouse functions (e.g. toStartOfMonth, formatDateTime).
- Use ILIKE for case-insensitive matching.
- Be careful with types; ClickHouse is strict.
- Use database.table_name when querying tables.
- Example with string filter:
  SQL: SELECT * FROM db.users WHERE status = {status:String} LIMIT 100
  params: [{name: "status", value: "active"}]
- Example with date range (CRITICAL - use different param names for each date):
  SQL: SELECT * FROM db.events WHERE created_at >= {start_date:DateTime} AND created_at < {end_date:DateTime} LIMIT 100
  params: [{name: "start_date", value: "2024-01-22 00:00:00"}, {name: "end_date", value: "2024-01-29 00:00:00"}]
- Example with numeric filter:
  SQL: SELECT * FROM db.orders WHERE customer_id = {customer_id:Int32} LIMIT 100
  params: [{name: "customer_id", value: 12345}]
`,
	mysql: "Use MySQL syntax. Use ? placeholders and backticks for identifiers.",
};

const sqlResponseSchema = z.object({
	sql: z.string().describe("A single parameterized SELECT statement"),
	params: z
		.array(
			z.object({
				name: z.string().describe("Parameter name matching the placeholder in the SQL"),
				value: z.union([z.string(), z.number(), z.boolean()]).describe("The literal value to bind"),
				description: z.string().nullable().describe("What this parameter filters on"),
			}),
		)
		.describe("Bind parameters for the query, one per placeholder"),
	rationale: z
		.string()
		.describe(
			"User-facing summary: which columns and tables answer the question and why. Never mention internal corrections, rewrites, or implementation decisions. Never include tenant ID, customer ID, or any tenant/customer identifier. When the question refers to a dimension (e.g. country, region), state which database column is used (e.g. 'Country uses ip_country').",
		),
});

export interface GenerateV2Input {
	question: string;
	/** Original user question before intent rewriting, used for gold SQL exact match detection */
	originalQuestion?: string;
	contextChunks: ContextChunk[];
	dialect?: string;
	primaryTable?: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	conversationHistory?: SessionTurnContext[];
	intent?: IntentResult;
	/** Schema linking context: join hints to include in the prompt */
	joinHints?: string[];
	timeColumns?: string[];
	/** Previous SQL to use as a base when modifying an existing query */
	previousSql?: string;
	timeColumns?: string[];
	telemetry?: TelemetryContext;
	/** Override SQL generator model (OpenAI id); omit for server default */
	modelId?: string;
}

export interface RewriteDateFilterInput {
	previousSql: string;
	previousParams: Array<Record<string, unknown>>;
	/** When provided, the generated rationale must preserve this (e.g. field mappings) and only update the date range part. */
	previousRationale?: string;
	dateRange: { from?: string; to?: string };
	question: string;
	dialect?: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	timeColumns?: string[];
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	telemetry?: TelemetryContext;
	modelId?: string;
}

export interface ModifySqlInput {
	previousSql: string;
	previousParams: Array<Record<string, unknown>>;
	/** When provided, preserve this rationale's field-mapping guidance in the new rationale. */
	previousRationale?: string;
	instruction: string;
	question: string;
	dialect?: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	contextChunks?: ContextChunk[];
	joinHints?: string[];
	timeColumns?: string[];
	modelId?: string;
}

export interface RepairV2Input {
	question: string;
	/** Original user question before intent rewriting, used for gold SQL exact match detection */
	originalQuestion?: string;
	contextChunks: ContextChunk[];
	dialect?: string;
	primaryTable?: string;
	previousSql: string;
	error: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	/** Optional additional system prompt text injected by the caller (v2 only). */
	systemPrompt?: string;
	conversationHistory?: SessionTurnContext[];
	intent?: IntentResult;
	timeColumns?: string[];
	telemetry?: TelemetryContext;
	modelId?: string;
}

/**
 * SQL generator using Vercel AI SDK's `generateObject` for structured output.
 *
 * Key differences from v1:
 * - Uses `generateObject` with a Zod schema instead of free-text JSON parsing
 * - Receives the intent/plan from the upstream step for better SQL generation
 * - No need for StringOutputParser or manual JSON.parse
 */
export class SqlGeneratorV2Service {
	private modelId: string;

	constructor() {
		this.modelId = config.models.sqlGenerator;
	}

	private resolveModelId(override?: string | null): string {
		const t = override?.trim();
		return t && t.length > 0 ? t : this.modelId;
	}

	async generate(input: GenerateV2Input): Promise<GeneratedQuery> {
		const { object } = await generateObject({
			model: openai(this.resolveModelId(input.modelId)),
			schema: sqlResponseSchema,
			system: buildSystemPrompt(input.systemPrompt),
			prompt: buildUserPrompt(input),
			experimental_telemetry: buildTelemetry("sql_generation", input.telemetry, ["nl_to_sql", "generate"]),
		});

		logger.debug({ sql: object.sql }, "SQL generated via AI SDK");

		return {
			sql: object.sql.trim(),
			params: normalizeDateTimeParams(object.params as Array<Record<string, unknown>>),
			rationale: object.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}

	/**
	 * Generate N SQL candidates concurrently at temperature > 0,
	 * then pick the best one using structural scoring.
	 *
	 * Self-consistency: if all candidates produce the same SQL structure,
	 * confidence is high. If they diverge, we pick the one that references
	 * the most verified schema elements.
	 */
	async generateMultiple(
		input: GenerateV2Input,
		n = 3,
	): Promise<GeneratedQuery> {
		const candidates = await Promise.all(
			Array.from({ length: n }, () => this.generateWithTemperature(input, 0.3)),
		);

		const best = pickBestCandidate(candidates, input.contextChunks);
		logger.debug(
			{
				candidateCount: candidates.length,
				bestSql: best.sql.slice(0, 80),
			},
			"Multi-candidate generation completed",
		);
		return best;
	}

	/**
	 * Single generation at a given temperature (for multi-candidate use).
	 */
	private async generateWithTemperature(
		input: GenerateV2Input,
		temperature: number,
	): Promise<GeneratedQuery> {
		const { object } = await generateObject({
			model: openai(this.resolveModelId(input.modelId)),
			schema: sqlResponseSchema,
			temperature,
			system: buildSystemPrompt(input.systemPrompt),
			prompt: buildUserPrompt(input),
			experimental_telemetry: buildTelemetry("sql_generation", input.telemetry, ["nl_to_sql", "generate", "multi_candidate"]),
		});

		return {
			sql: object.sql.trim(),
			params: normalizeDateTimeParams(object.params as Array<Record<string, unknown>>),
			rationale: object.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}

	async repair(input: RepairV2Input): Promise<GeneratedQuery> {
		const { context, goldSqlBlock, hasExactMatch } = formatContextWithGoldSql(
			input.contextChunks,
			input.question,
			input.originalQuestion,
		);
		const conversationHistory = formatConversationHistory(
			input.conversationHistory,
		);
		const tenantContext = buildTenantContext(
			input.tenantId,
			input.tenantSettings,
		);
		const dialectInstructions = getDialectInstructions(input.dialect);
		const timeColumnsBlock = input.timeColumns?.length
			? `## Available Date/Time Columns\n${input.timeColumns.join(", ")}\nOnly use columns from this list for date filtering, grouping, bucketing, or time-series logic.`
			: "";

		const goldSqlHeader = hasExactMatch
			? `## Gold SQL References (EXACT MATCH)\nAn exact matching gold SQL was found. Use its structure directly.\n\n${goldSqlBlock}`
			: goldSqlBlock
				? `## Gold SQL References\n${goldSqlBlock}`
				: "";

		const { object } = await generateObject({
			model: openai(this.resolveModelId(input.modelId)),
			schema: sqlResponseSchema,
			system: [
				`# Role
You are an expert SQL debugger in a text-to-SQL system. You fix broken queries by analyzing error messages against the schema context.

# Task
Given a failed SQL query and its error message, produce a corrected query that answers the original question.

# Instructions
1. Diagnose the specific error — fix only what is broken. Preserve the original query logic.
2. If the table name is "unknown", derive the correct table from the schema context.
3. Use the same parameterization style and dialect conventions as the original query.
4. Ensure date/time references are parameterized with calculated values based on today's date (never hardcoded). Format: "YYYY-MM-DD HH:MM:SS".
5. Never use SELECT * — always list explicit columns.
6. Always include a LIMIT clause (default 100, max 1000).
7. For GROUP BY, use at most 5-7 grouping dimensions.
8. If gold SQL references are provided (especially exact matches), use their structure as the basis for the corrected query.
9. Preserve the requested SQL dialect exactly. For BigQuery, never use $1, :: casts, ILIKE, or FROM_UNIXTIME().

# Output
- \`rationale\`: User-facing — explain the SQL approach and columns used. Never mention the error, what was wrong, or internal fixes. Never include tenant ID, customer ID, or any tenant/customer identifier. When the question refers to a dimension (e.g. country, region), state which database column is used (e.g. "Country uses ip_country"); preserve this in every rationale.`,
				formatInjectedSystemPrompt(input.systemPrompt),
			]
				.filter(Boolean)
				.join("\n\n"),
			prompt: [
				`## Question\n${input.question}`,
				`## Conversation History\n${conversationHistory}`,
				`## Parameters\n- Primary table: ${input.primaryTable ?? "not specified"}\n- Dialect: ${dialectInstructions}\n- Today: ${new Date().toISOString().slice(0, 10)}`,
				tenantContext ? `## Tenant Isolation\n${tenantContext}` : "",
				timeColumnsBlock,
				goldSqlHeader,
				`## Failed SQL\n\`\`\`sql\n${input.previousSql}\n\`\`\``,
				`## Error Message\n${input.error}`,
				`## Schema Context\n${context}`,
			]
				.filter(Boolean)
				.join("\n\n"),
			experimental_telemetry: buildTelemetry("sql_repair", input.telemetry, ["nl_to_sql", "repair"]),
		});

		logger.debug({ sql: object.sql }, "SQL repaired via AI SDK");

		return {
			sql: object.sql.trim(),
			params: normalizeDateTimeParams(object.params as Array<Record<string, unknown>>),
			rationale: object.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}

	async rewriteDateFilter(input: RewriteDateFilterInput): Promise<GeneratedQuery> {
		const dialectInstructions = getDialectInstructions(input.dialect);
		const tenantContext = buildTenantContext(input.tenantId, input.tenantSettings);

		const dateRangeDescription = [
			input.dateRange.from ? `from: ${input.dateRange.from}` : null,
			input.dateRange.to ? `to: ${input.dateRange.to}` : null,
		]
			.filter(Boolean)
			.join(", ");

		const { object } = await generateObject({
			model: openai(this.resolveModelId(input.modelId)),
			schema: sqlResponseSchema,
			system: [
				`# Role
You are an expert SQL editor. You modify existing SQL queries to change ONLY the date/time filter parameters.

# Task
Given an existing SQL query and a new date range, rewrite the query so that its date filters reflect the new range. Preserve everything else exactly as-is.

# Instructions
1. ONLY change date filter conditions (WHERE clauses involving date/time columns) and their corresponding parameters.
2. Preserve ALL other parts of the query exactly: same SELECT columns, JOINs, GROUP BY, ORDER BY, LIMIT, and non-date WHERE conditions.
3. If the query has no existing date filter, add a WHERE clause on the most appropriate date/time column. If "Available Date/Time Columns" are provided, you MUST pick from that list.
4. Use parameterized placeholders — never inline literal date values in the SQL.
5. Format date values as "YYYY-MM-DD HH:MM:SS" (no "T", no "Z", no milliseconds).
6. Use "00:00:00" for start dates and "23:59:59" for end dates when only a date (no time) is provided.
7. Keep the same parameter naming conventions as the original query.

# Output
- \`sql\`: The modified SQL with updated date filters. Must be identical to the input SQL except for date filter changes.
- \`params\`: Updated bind parameters reflecting the new date range.
- \`rationale\`: Preserve the existing rationale's description of what the query does (tables, columns, and which field is used for each dimension, e.g. "country uses ip_country"). Only update or append the date range part. Output a single rationale that keeps the original meaning and adds/updates the date range. NEVER include or mention tenant ID, customer ID, or any tenant/customer identifier.`,
				formatInjectedSystemPrompt(input.systemPrompt),
			]
				.filter(Boolean)
				.join("\n\n"),
			prompt: [
				input.previousRationale
					? `## Existing Rationale (preserve this; only update the date range part)\n${input.previousRationale}`
					: "",
				`## Original SQL\n\`\`\`sql\n${input.previousSql}\n\`\`\``,
				`## Original Parameters\n${JSON.stringify(input.previousParams, null, 2)}`,
				`## New Date Range\n${dateRangeDescription}`,
				`## Question\n${input.question}`,
				`## Dialect\n${dialectInstructions}`,
				`## Today\n${new Date().toISOString().slice(0, 10)}`,
				tenantContext ? `## Tenant Isolation\n${tenantContext}` : "",
				input.timeColumns?.length
					? `## Available Date/Time Columns\n${input.timeColumns.join(", ")}\nOnly use columns from this list for date filtering.`
					: "",
			]
				.filter(Boolean)
				.join("\n\n"),
			experimental_telemetry: buildTelemetry("sql_date_rewrite", input.telemetry, ["nl_to_sql", "date_rewrite"]),
		});

		logger.debug({ sql: object.sql }, "SQL date filter rewritten via AI SDK");

		return {
			sql: object.sql.trim(),
			params: normalizeDateTimeParams(object.params as Array<Record<string, unknown>>),
			rationale: object.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}

	async modifySql(input: ModifySqlInput): Promise<GeneratedQuery> {
		const dialectInstructions = getDialectInstructions(input.dialect);
		const tenantContext = buildTenantContext(input.tenantId, input.tenantSettings);

		const hasContext = input.contextChunks && input.contextChunks.length > 0;
		const contextBlock = hasContext
			? formatContext(input.contextChunks!)
			: "";
		const joinBlock = input.joinHints?.length
			? input.joinHints.map((h) => `- ${h}`).join("\n")
			: "";

		const { object } = await generateObject({
			model: openai(this.resolveModelId(input.modelId)),
			schema: sqlResponseSchema,
			system: [
				`# Role
You are an expert SQL editor in a text-to-SQL system. You apply targeted modifications to existing SQL queries.

# Task
Given an existing SQL query and a modification instruction, produce the modified query. Preserve as much of the original query as possible — only change what the instruction requires.

# Instructions
1. Start from the previous SQL and apply ONLY the requested modification.
2. Preserve all existing SELECT columns, JOINs, GROUP BY, ORDER BY, LIMIT, and WHERE conditions that are not affected by the modification.
3. If schema context is provided, use it to find correct column names, types, and JOIN conditions for any new elements.
4. Use parameterized placeholders — never inline literal values in SQL.
5. Format date values as "YYYY-MM-DD HH:MM:SS" (no "T", no "Z", no milliseconds).
6. Always include a LIMIT clause (default 100, max 1000).
7. Never use SELECT * — always list explicit columns.

# Output
- \`sql\`: The modified SQL query.
- \`params\`: Updated bind parameters.
- \`rationale\`: User-facing summary of what the query does. Never mention internal modifications or that this is a modified query. Never include tenant ID, customer ID, or any tenant/customer identifier. When the question refers to a dimension (e.g. country, region), state which database column is used; preserve this field-mapping in every rationale.`,
				formatInjectedSystemPrompt(input.systemPrompt),
			]
				.filter(Boolean)
				.join("\n\n"),
			prompt: [
				input.previousRationale
					? `## Existing Rationale (preserve field-mapping guidance, e.g. which column is used for country/region)\n${input.previousRationale}`
					: "",
				`## Modification Instruction\n${input.instruction}`,
				`## Question\n${input.question}`,
				`## Previous SQL\n\`\`\`sql\n${input.previousSql}\n\`\`\``,
				`## Previous Parameters\n${JSON.stringify(input.previousParams, null, 2)}`,
				`## Dialect\n${dialectInstructions}`,
				`## Today\n${new Date().toISOString().slice(0, 10)}`,
				tenantContext ? `## Tenant Isolation\n${tenantContext}` : "",
				input.timeColumns?.length
					? `## Available Date/Time Columns\n${input.timeColumns.join(", ")}\nIf you add or change date filters, only use columns from this list.`
					: "",
				contextBlock ? `## Schema Context\n${contextBlock}` : "",
				joinBlock ? `## Join Hints\n${joinBlock}` : "",
			]
				.filter(Boolean)
				.join("\n\n"),
		});

		logger.debug({ sql: object.sql }, "SQL modified via AI SDK");

		return {
			sql: object.sql.trim(),
			params: normalizeDateTimeParams(object.params as Array<Record<string, unknown>>),
			rationale: object.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}
}

// ── helpers ─────────────────────────────────────────────────────────

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

/**
 * Normalize DateTime param values from ISO 8601 to ClickHouse-compatible format.
 * "2026-01-01T00:00:00.000Z" → "2026-01-01 00:00:00"
 */
export function normalizeDateTimeParams(
	params: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
	return params.map((param) => {
		const value = param.value;
		if (typeof value === "string" && ISO_DATETIME_RE.test(value)) {
			return {
				...param,
				value: value.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, ""),
			};
		}
		return param;
	});
}

function buildSystemPrompt(injected?: string): string {
	const base = buildBaseSystemPrompt();
	const extra = formatInjectedSystemPrompt(injected);
	return [base, extra].filter(Boolean).join("\n\n");
}

function buildBaseSystemPrompt(): string {
	return `# Role
You are an expert analytics engineer in a text-to-SQL system. You translate natural-language questions into parameterized SQL queries using only the schema and reference material provided.

# Task
Generate a single parameterized SELECT statement that answers the user's question, along with bind parameters and a user-facing rationale.

# Instructions

## 1. Gold SQL Reference Queries (highest priority)
When gold SQL examples are provided, they are curated expert queries and the best signal for correct SQL.
- If the section is marked "(EXACT MATCH)", use that gold SQL directly — copy its structure, columns, JOINs, GROUP BY, and filters. Only adapt for parameterization, tenant isolation, and LIMIT.
- If one closely matches the user's question, follow its structure: same columns, JOINs, GROUP BY, and filters.
- You may adapt for parameterization, tenant isolation, and LIMIT, but preserve the core logic.
- If multiple gold SQL examples are present, pick the most relevant one.
- NEVER ignore gold SQL in favor of your own query design when a matching example exists.

## 2. Schema & Context Rules
- Use ONLY tables and columns present in the provided schema context.
- Never invent tables or columns. Never use "unknown" as a table name.
- If the primary table is "not specified", derive it from the schema context.
- If conversation history is provided, use it to resolve follow-up questions (pronouns, implicit references).

## 3. Date & Time Handling
CRITICAL: Use the "Today" date from the user message as the reference point for ALL date calculations. Do NOT use any other date.
1. Calculate actual date values from today's date (provided in the ## Parameters section of the user message).
2. Add them as parameterized filters with descriptive param names (e.g. start_date, end_date).
3. Format date values as "YYYY-MM-DD HH:MM:SS" (no "T", no "Z", no milliseconds).
4. If an "Available Date/Time Columns" section is provided, ONLY use columns from that list for date filtering, grouping, bucketing, or time-series logic.
5. Preserve the requested dialect exactly. Never mix syntax from another SQL dialect.
6. For BigQuery specifically: use only named parameters like @start_date, never $1 or FROM_UNIXTIME(). If a time column is STRING, use BigQuery-native parsing/casting such as TIMESTAMP(...), PARSE_TIMESTAMP(...), CAST(... AS TIMESTAMP), SAFE_CAST(...), or DATE(TIMESTAMP(...)) depending on the actual value shape.
7. For BigQuery column references: if you do not define a table alias in FROM/JOIN, use unqualified column names. If you use qualified column references, you MUST declare the alias explicitly and use that alias consistently.

## 4. Column Selection
- Never use SELECT * — always list explicit columns.
- For "all columns" or "everything" requests, select the 8-12 most relevant columns.
- Prefer: IDs, names, dates, amounts, status fields. Omit: large text/JSON blobs, low-value metadata.
- For GROUP BY, use at most 5-7 grouping dimensions.
- If you omit columns, explain why in the rationale.

## 5. Security & Performance
- List/detail queries: always include a LIMIT clause (default 100, max 1000).
- Aggregations: if the user asks for a trend/time-series and does not specify a range, default to **last 1 month** (30 days) based on "Today" and bind it as parameters, so the query does not scan unbounded data.
- For other aggregations without a specified range, use a sensible bounded default (e.g. last 30/90 days) based on "Today" and bind it as parameters.
- For GROUP BY aggregations also include LIMIT to cap result rows.
- Use dialect-specific parameterized placeholders — never inline literal values in SQL.

## 6. Previous SQL Reference
When a "Previous SQL" section is provided, the user is modifying an existing query.
- Use the previous SQL as your starting template — preserve its table references, JOINs, GROUP BY, and overall structure.
- Only change what the user's question explicitly asks to modify (e.g. date range, granularity, filters).
- Do NOT rewrite the query from scratch when a previous SQL reference is available.

# Output
- \`sql\`: A single SELECT statement. No DDL, DML, or multiple statements.
- \`params\`: One entry per placeholder with name, value, and description.
- \`rationale\`: User-facing. Explain which tables/columns answer the question and why. Never mention internal implementation details.
  - NEVER include or mention the tenant ID, customer ID, or any tenant/customer identifier value in the rationale.
  - When the user's question refers to a dimension (e.g. country, region, device type), the rationale MUST state which database column is used (e.g. "Country is shown using the ip_country column"). This field-mapping guidance MUST be included in every rationale and preserved in follow-up turns.`;
}

function formatInjectedSystemPrompt(injected?: string): string {
	const value = typeof injected === "string" ? injected.trim() : "";
	if (!value) return "";
	const clipped = value.length > 8000 ? value.slice(0, 8000) : value;
	return `# Caller System Instructions (customer-configured)
The following instructions come from the calling application (your customer).

PRIORITY:
- When these instructions conflict with generic defaults or guardrails earlier in this prompt, follow the **caller's** instructions.
- Earlier sections are baseline defaults; the customer may relax or replace LIMIT conventions, parameterization style where they specify otherwise, tenant isolation requirements, rationale rules, and similar policy as they configure their integration.

${clipped}`;
}

/**
 * Build the complete user prompt from input data.
 * Keeps user prompt data-only — all instructions live in the system prompt.
 */
function buildUserPrompt(input: GenerateV2Input): string {
	const { context, goldSqlBlock, hasExactMatch } = formatContextWithGoldSql(
		input.contextChunks,
		input.question,
		input.originalQuestion,
	);
	const conversationHistory = formatConversationHistory(input.conversationHistory);
	const tenantContext = buildTenantContext(input.tenantId, input.tenantSettings);
	const dialectInstructions = getDialectInstructions(input.dialect);
	const planBlock = formatPlan(input.intent);
	const joinBlock = input.joinHints?.length
		? input.joinHints.map((h) => `- ${h}`).join("\n")
		: "";

	const goldSqlHeader = hasExactMatch
		? `## Gold SQL Reference Queries (EXACT MATCH)\nAn exact matching gold SQL was found for this question. You MUST use its SQL structure directly — only adapt for parameterization, tenant isolation, and LIMIT.\n\n${goldSqlBlock}`
		: goldSqlBlock
			? `## Gold SQL Reference Queries\nCurated expert examples — follow their structure closely when relevant.\n\n${goldSqlBlock}`
			: "";

	const previousSqlBlock = input.previousSql
		? `## Previous SQL\nThe user is modifying an existing query. Use this SQL as the base — preserve its structure and only change what the question asks.\n\`\`\`sql\n${input.previousSql}\n\`\`\``
		: "";
	const timeColumnsBlock = input.timeColumns?.length
		? `## Available Date/Time Columns\n${input.timeColumns.join(", ")}\nOnly use columns from this list for date filtering, grouping, bucketing, or time-series logic.`
		: "";

	return [
		`## Question\n${input.question}`,
		previousSqlBlock,
		`## Conversation History\n${conversationHistory}`,
		`## Parameters\n- Primary table: ${input.primaryTable ?? "not specified"}\n- Dialect: ${dialectInstructions}\n- Today: ${new Date().toISOString().slice(0, 10)}`,
		tenantContext ? `## Tenant Isolation\n${tenantContext}` : "",
		timeColumnsBlock,
		planBlock ? `## Query Plan\n${planBlock}` : "",
		joinBlock ? `## Join Hints\n${joinBlock}` : "",
		goldSqlHeader,
		`## Schema Context\n${context}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Separate gold_sql chunks from other context chunks and format them
 * into distinct blocks so the SQL generator can prioritize them.
 *
 * Also detects whether any gold_sql entry is an exact or near-exact
 * match for the user's question, so the prompt can signal this.
 */
function formatContextWithGoldSql(
	chunks: ContextChunk[],
	question?: string,
	originalQuestion?: string,
): {
	context: string;
	goldSqlBlock: string;
	hasExactMatch: boolean;
} {
	const goldChunks: ContextChunk[] = [];
	const otherChunks: ContextChunk[] = [];

	for (const chunk of chunks) {
		if (chunk.source === "gold_sql") {
			goldChunks.push(chunk);
		} else {
			otherChunks.push(chunk);
		}
	}

	const context = formatContext(otherChunks);

	// Detect exact/near-exact match between user question and gold_sql names.
	// Check both the (possibly rewritten) question AND the original question,
	// since intent rewriting can change wording enough to break the match.
	let hasExactMatch = false;
	if (goldChunks.length > 0) {
		const questionsToCheck = [question, originalQuestion].filter(Boolean) as string[];
		for (const chunk of goldChunks) {
			const entryName = chunk.metadata.entry_name as string | undefined;
			if (!entryName) continue;
			if (questionsToCheck.some((q) => isExactOrNearGoldSqlMatch(q, entryName))) {
				hasExactMatch = true;
				logger.debug(
					{ entryName, question, originalQuestion },
					"Gold SQL exact match detected",
				);
				break;
			}
		}
	}

	const goldSqlBlock = goldChunks.length > 0
		? goldChunks
			.map((chunk) => {
				const table = chunk.metadata.table ? `Table: ${chunk.metadata.table}` : "";
				const name = chunk.metadata.entry_name ? `Name: ${chunk.metadata.entry_name}` : "";
				return [name, table, chunk.pageContent].filter(Boolean).join("\n");
			})
			.join("\n---\n")
		: "";

	return { context, goldSqlBlock, hasExactMatch };
}

function formatContext(chunks: ContextChunk[]): string {
	return chunks
		.map((chunk) => {
			const table = chunk.metadata.table
				? `Table: ${chunk.metadata.table}`
				: "";
			const column = chunk.metadata.column
				? `Column: ${chunk.metadata.column}`
				: "";
			return [table, column, chunk.pageContent].filter(Boolean).join("\n");
		})
		.join("\n---\n");
}

function formatConversationHistory(turns?: SessionTurnContext[]): string {
	if (!turns?.length) return "None";
	return turns
		.map((turn, index) => {
			const sql = turn.sql ? `SQL: ${turn.sql}` : "SQL: (none)";
			const rationale = turn.rationale ? `Rationale: ${turn.rationale}` : "";
			return [`Turn ${index + 1}`, `Q: ${turn.question}`, sql, rationale]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n---\n");
}

function getDialectInstructions(dialect?: string): string {
	if (!dialect) return "Use ANSI SQL with numbered parameters ($1, $2).";
	const normalized = dialect.toLowerCase();
	return (
		DIALECT_INSTRUCTIONS[normalized] ??
		"Use ANSI SQL with numbered parameters ($1, $2)."
	);
}

function buildTenantContext(
	tenantId?: string,
	tenantSettings?: TenantSettings,
): string {
	let ctx = "";
	if (tenantSettings) {
		const { tenantFieldName, tenantFieldType, enforceTenantIsolation } =
			tenantSettings;
		ctx = [
			"- Tenant Isolation Configuration:",
			`  - Field name: ${tenantFieldName}`,
			`  - Field type: ${tenantFieldType}`,
			`  - Enforcement: ${enforceTenantIsolation ? "REQUIRED" : "optional"}`,
		].join("\n");

		if (enforceTenantIsolation) {
			ctx += `\n- CRITICAL: You MUST filter by "${tenantFieldName}". Do NOT use "tenant_id" unless that is the explicit field name.`;
		}
	}

	if (tenantId) {
		const fieldName = tenantSettings?.tenantFieldName ?? "tenant column";
		ctx += `\n- Tenant ID: "${tenantId}" (use this value for ${fieldName} filtering)`;
	}
	return ctx;
}

/**
 * Pick the best SQL candidate from N generated queries.
 *
 * Scoring criteria:
 *  1. Schema coverage: how many context table/column names appear in the SQL
 *  2. Structural validity: basic checks (has LIMIT, no SELECT *)
 *  3. Consensus: candidates that match the majority structure score higher
 */
function pickBestCandidate(
	candidates: GeneratedQuery[],
	contextChunks: ContextChunk[],
): GeneratedQuery {
	if (candidates.length === 1) return candidates[0]!;

	// Collect known tables and columns from context
	const knownTables = new Set<string>();
	const knownColumns = new Set<string>();
	for (const chunk of contextChunks) {
		const table = chunk.metadata.table;
		const column = chunk.metadata.column;
		if (typeof table === "string") knownTables.add(table.toLowerCase());
		if (typeof column === "string") knownColumns.add(column.toLowerCase());
	}

	// Normalize SQL for comparison: collapse whitespace, lowercase
	const normalize = (sql: string) =>
		sql.replace(/\s+/g, " ").toLowerCase().trim();

	const scored = candidates.map((candidate) => {
		const sqlLower = normalize(candidate.sql);
		let score = 0;

		// Schema coverage: +2 for each known table, +1 for each known column
		for (const table of knownTables) {
			if (sqlLower.includes(table)) score += 2;
		}
		for (const col of knownColumns) {
			if (sqlLower.includes(col)) score += 1;
		}

		// Structural validity bonuses
		if (/limit\s+\d+/i.test(candidate.sql)) score += 3;
		if (!/select\s+\*/i.test(candidate.sql)) score += 3;

		// Consensus bonus: compare with other candidates
		for (const other of candidates) {
			if (other === candidate) continue;
			// Extract tables referenced (rough: word after FROM or JOIN)
			const thisTables = extractReferencedTables(candidate.sql);
			const otherTables = extractReferencedTables(other.sql);
			const overlap = thisTables.filter((t) => otherTables.includes(t)).length;
			score += overlap; // bonus for table consensus
		}

		return { candidate, score };
	});

	scored.sort((a, b) => b.score - a.score);
	return scored[0]!.candidate;
}

function extractReferencedTables(sql: string): string[] {
	const tables: string[] = [];
	const regex = /(?:from|join)\s+([a-z_][a-z0-9_.]*)/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(sql)) !== null) {
		tables.push(match[1]!.toLowerCase());
	}
	return tables;
}

function formatPlan(intent?: IntentResult): string {
	if (!intent) return "";
	return [
		`- Intent: ${intent.intent}`,
		`- Confidence: ${intent.confidence}`,
		`- Tables: ${intent.plan.tables.join(", ") || "unknown"}`,
		`- Operations: ${intent.plan.operations.join(", ")}`,
		`- Filters: ${intent.plan.filters.join(", ") || "none"}`,
		intent.plan.orderBy ? `- Order by: ${intent.plan.orderBy}` : "",
		intent.plan.limit ? `- Limit: ${intent.plan.limit}` : "",
		intent.ambiguities.length > 0
			? `- Ambiguities: ${intent.ambiguities.map((a) => a.issue).join("; ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}
