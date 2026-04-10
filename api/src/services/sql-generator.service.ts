import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import type { CallbackHandler } from "@langfuse/langchain";
import { config } from "../config";
import type { ContextChunk, GeneratedQuery } from "../types/query";
import type { TenantSettings } from "./schema-storage.service";
import type { SessionTurnContext } from "../types/session";

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
- CRITICAL: Always reference tables using the exact identifier shape shown in the provided schema context.
  - If schema context shows fully-qualified tables (project.dataset.table), you MUST use that full form (with backticks) in SQL.
  - Do NOT rely on default dataset/project resolution (avoid using only dataset.table) unless the schema context explicitly uses that exact form.
- Use backticks for fully-qualified identifiers.
- Use standard BigQuery date/time functions.`,
	clickhouse: `Use ClickHouse SQL syntax.
- Use {name:Type} style placeholders (single braces) where 'name' MUST match the param name exactly.
- Common types: String, Int32, Int64, Float64, DateTime, Date, Array(String), Array(Int32).
- CRITICAL: The placeholder name must match the 'name' field in params array.
- ALWAYS include a LIMIT clause (default 100) if not specified.
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

interface GenerateInput {
	question: string;
	contextChunks: ContextChunk[];
	dialect?: string;
	primaryTable?: string;
	tenantId?: string;
	tenantSettings?: TenantSettings;
	conversationHistory?: SessionTurnContext[];
	callbacks?: CallbackHandler[];
}

interface RepairInput {
	question: string;
	contextChunks: ContextChunk[];
	dialect?: string;
	primaryTable?: string;
	previousSql: string;
	error: string;
	tenantId?: string;
	conversationHistory?: SessionTurnContext[];
	callbacks?: CallbackHandler[];
}

export class SqlGeneratorService {
	private chain: RunnableSequence<Record<string, string>, string>;
	private repairChain: RunnableSequence<Record<string, string>, string>;

	constructor(
		private readonly model = new ChatOpenAI({
			openAIApiKey: config.openai.apiKey,
			modelName: config.models.sqlGenerator,
			// temperature: 0,
		}),
	) {
		const prompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				[
					"You are an expert analytics engineer generating parameterized SQL queries.",
					"Always return JSON with keys sql, params (array), and rationale.",
					"Use only the provided context and mention assumptions explicitly.",
					"Rationale must include which columns were used (by table when possible). When the user asks about a dimension (e.g. country, region), state which database column is used (e.g. 'Country uses ip_country'). Never mention or include the tenant ID, customer ID, or any tenant/customer identifier in the rationale.",
					"If conversation history is provided, use it to resolve follow-up questions.",
					"CRITICAL: Never use 'unknown' as a table name. If the primary table is not specified, derive it from the context.",
					"Never invent tables or columns that don't exist in the context.",
					"",
					"SECURITY & PERFORMANCE REQUIREMENTS:",
					"1. NEVER use SELECT * - always specify explicit columns",
					"2. For list/detail queries: ALWAYS include a LIMIT clause (default 100, max 1000). For aggregations (SUM, COUNT, AVG, etc.): scope with a time range (e.g. last 30/90 days, this year) so the query does not scan unbounded data; for GROUP BY aggregations also include LIMIT to cap result rows.",
					"3. For GROUP BY queries, use maximum 5-7 grouping columns to prevent excessive cardinality",
					"4. When user requests 'all columns', intelligently select the 8-12 most important/relevant columns instead",
					"5. If excluding columns, explain in rationale why they were omitted",
					"6. Prioritize: ID columns, names, dates, amounts, status fields over metadata like created_at, updated_at unless specifically requested",
				].join("\n"),
			],
			[
				"human",
				[
					"Question: {question}",
					"Conversation History:\n{conversation_history}",
					"Primary table: {primary_table}",
					"Dialect: {dialect}",
					"Today's date: {current_date}",
					"Instructions:",
					"- SQL must be a single SELECT.",
					"- If primary table is 'not specified', identify the correct table from the context below.",
					"- Parameterize filters using dialect specific placeholders.",
					"- Include an array 'params' describing each placeholder (name, value -> actual value, no placeholder here, description).",
					"- CRITICAL: When the question contains time/date references like 'last 7 days', 'this month', 'yesterday', etc., you MUST:",
					"  1. Convert them to actual date values (calculate based on today's date)",
					"  2. Add them as parameterized filters with start_date and/or end_date params",
					"  3. Include these params in the 'params' array with their calculated values",
					"  Example: 'last 7 days' -> params: [{{name: 'start_date', value: '2024-01-22'}}, {{name: 'end_date', value: '2024-01-29'}}]",
					"- For AGGREGATION questions (total revenue, count of X, average Y, etc.): if the user does not specify a time range, scope the query by a sensible default (e.g. last 30 days or last 90 days) using a date column from context, so the query does not scan the entire table. Always add WHERE filters for that range (parameterized). For GROUP BY aggregations also include LIMIT (e.g. LIMIT 100).",
					"",
					"COLUMN SELECTION STRATEGY:",
					"- If user asks for 'all columns', 'everything', or 'grouped by all columns', select only the most relevant 8-12 columns",
					"- Avoid selecting large text fields, JSON blobs, or low-value metadata columns unless specifically requested",
					"- For GROUP BY with many potential columns, choose max 5 meaningful grouping dimensions",
					"- Example: 'show records grouped by all columns' -> SELECT top 5-7 key columns GROUP BY those columns LIMIT 100",
					"{tenant_context}",
					"Context:\n{context}",
					"Respond with JSON only.",
				].join("\n"),
			],
		]);

		this.chain = RunnableSequence.from([
			prompt,
			this.model,
			new StringOutputParser(),
		]);

		// Repair chain for fixing SQL errors
		const repairPrompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				[
					"You are an expert SQL debugger fixing broken queries.",
					"Analyze the error message and previous SQL attempt.",
					"Always return JSON with keys sql, params (array), and rationale.",
					"Focus on fixing the specific error without changing the query logic unnecessarily.",
					"Rationale must include which columns were used (by table when possible). When the user asks about a dimension (e.g. country, region), state which database column is used. Never mention or include the tenant ID, customer ID, or any tenant/customer identifier in the rationale.",
					"CRITICAL: Never use 'unknown' as a table name. Derive table names from context.",
					"",
					"SECURITY & PERFORMANCE REQUIREMENTS:",
					"1. NEVER use SELECT * - always specify explicit columns",
					"2. ALWAYS include a LIMIT clause (default 100, maximum 1000)",
					"3. For GROUP BY queries, use maximum 5-7 grouping columns",
					"4. If the error is about too many columns or performance, reduce column count intelligently",
				].join("\n"),
			],
			[
				"human",
				[
					"Question: {question}",
					"Conversation History:\n{conversation_history}",
					"Primary table: {primary_table}",
					"Dialect: {dialect}",
					"Today's date: {current_date}",
					"{tenant_context}",
					"Context:\n{context}",
					"",
					"PREVIOUS SQL (failed):",
					"{previous_sql}",
					"",
					"ERROR:",
					"{error}",
					"",
					"Instructions:",
					"- Use conversation history if provided to interpret follow-up questions",
					"- Analyze the error and fix the SQL",
					"- If the table name is 'unknown', find the correct table from context",
					"- Keep the same query logic if possible",
					"- Use the same parameterization approach",
					"- CRITICAL: Ensure time/date references in the question are parameterized with actual date values",
					"- If error mentions SELECT *, GROUP BY limits, or LIMIT requirements, fix those issues",
					"- Explain what was wrong in the rationale and list the columns used in the corrected SQL",
					"Respond with JSON only.",
				].join("\n"),
			],
		]);

		this.repairChain = RunnableSequence.from([
			repairPrompt,
			this.model,
			new StringOutputParser(),
		]);
	}

	private formatContext(chunks: ContextChunk[]): string {
		return chunks
			.map((chunk) => {
				const table = chunk.metadata.table
					? `Table: ${chunk.metadata.table}\n`
					: "";
				const column = chunk.metadata.column
					? `Column: ${chunk.metadata.column}\n`
					: "";
				return [`Source: ${chunk.source}`, table, column, chunk.pageContent]
					.filter(Boolean)
					.join("\n");
			})
			.join("\n---\n");
	}

	private formatConversationHistory(turns?: SessionTurnContext[]): string {
		if (!turns?.length) return "None";
		return turns
			.map((turn, index) => {
				const sql = turn.sql ? `SQL: ${turn.sql}` : "SQL: (none)";
				const rationale = turn.rationale
					? `Rationale: ${turn.rationale}`
					: "";
				return [
					`Turn ${index + 1}`,
					`Q: ${turn.question}`,
					sql,
					rationale,
				]
					.filter(Boolean)
					.join("\n");
			})
			.join("\n---\n");
	}

	private dialectInstructions(dialect?: string): string {
		if (!dialect) {
			return "Use ANSI SQL with numbered parameters ($1, $2).";
		}

		const normalized = dialect.toLowerCase();
		return (
			DIALECT_INSTRUCTIONS[normalized] ||
			"Use ANSI SQL with numbered parameters ($1, $2)."
		);
	}

	async generate(input: GenerateInput): Promise<GeneratedQuery> {
		const context = this.formatContext(input.contextChunks);
		const conversationHistory = this.formatConversationHistory(
			input.conversationHistory,
		);
		let tenantContext = "";

		if (input.tenantSettings) {
			const { tenantFieldName, tenantFieldType, enforceTenantIsolation } =
				input.tenantSettings;
			tenantContext = [
				"- Tenant Isolation Configuration:",
				`  - Field name: ${tenantFieldName}`,
				`  - Field type: ${tenantFieldType}`,
				`  - Enforcement: ${enforceTenantIsolation ? "REQUIRED" : "optional"}`,
			].join("\n");

			if (enforceTenantIsolation) {
				tenantContext += `\n- CRITICAL: You MUST filter by "${tenantFieldName}". Do NOT use "tenant_id" unless that is the explicit field name.`;
			}
		}

		if (input.tenantId) {
			const fieldName =
				input.tenantSettings?.tenantFieldName || "tenant column";
			tenantContext += `\n- Tenant ID: "${input.tenantId}" (use this value for ${fieldName} filtering)`;
		}

		const response = await this.chain.invoke(
			{
				question: input.question,
				context: context || "No context available",
				dialect: this.dialectInstructions(input.dialect),
				primary_table: input.primaryTable ?? "not specified",
				tenant_context: tenantContext,
				conversation_history: conversationHistory,
				current_date: new Date().toISOString().slice(0, 10),
			},
			{
				runName: "SQL Generation",
				callbacks: input.callbacks,
				tags: ["sql_generation", input.dialect ?? "ansi"],
				metadata: {
					operation: "SQL Generate",
					dialect: input.dialect ?? "ansi",
				},
			},
		);

		let parsed: {
			sql: string;
			params?: Array<Record<string, unknown>>;
			rationale?: string;
		};
		try {
			// Strip markdown code fences if present
			const cleanedResponse = response
				.replace(/^```json\n?/i, "")
				.replace(/\n?```$/i, "")
				.trim();
			parsed = JSON.parse(cleanedResponse);
		} catch {
			throw new Error("Failed to parse SQL generation response");
		}

		if (!parsed.sql) {
			throw new Error("Model response did not include SQL");
		}

		return {
			sql: parsed.sql.trim(),
			params: parsed.params ?? [],
			rationale: parsed.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}

	async repair(input: RepairInput): Promise<GeneratedQuery> {
		const context = this.formatContext(input.contextChunks);
		const conversationHistory = this.formatConversationHistory(
			input.conversationHistory,
		);
		const tenantContext = input.tenantId
			? `Tenant ID: ${input.tenantId} (use this value for tenant filtering)`
			: "";

		const response = await this.repairChain.invoke(
			{
				question: input.question,
				context: context || "No context available",
				dialect: this.dialectInstructions(input.dialect),
				primary_table: input.primaryTable ?? "not specified",
				tenant_context: tenantContext,
				conversation_history: conversationHistory,
				current_date: new Date().toISOString().slice(0, 10),
				previous_sql: input.previousSql,
				error: input.error,
			},
			{
				runName: "SQL Repair",
				callbacks: input.callbacks,
				tags: ["sql_repair", input.dialect ?? "ansi"],
				metadata: {
					operation: "SQL Repair",
					dialect: input.dialect ?? "ansi",
				},
			},
		);

		let parsed: {
			sql: string;
			params?: Array<Record<string, unknown>>;
			rationale?: string;
		};
		try {
			// Strip markdown code fences if present
			const cleanedResponse = response
				.replace(/^```json\n?/i, "")
				.replace(/\n?```$/i, "")
				.trim();
			parsed = JSON.parse(cleanedResponse);
		} catch {
			throw new Error("Failed to parse SQL repair response");
		}

		if (!parsed.sql) {
			throw new Error("Model response did not include SQL");
		}

		return {
			sql: parsed.sql.trim(),
			params: parsed.params ?? [],
			rationale: parsed.rationale,
			dialect: input.dialect ?? "ansi",
		};
	}
}
