import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/di";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { z } from "zod";
import { config } from "../../config";
import {
	executeSqlTool,
	generateSqlTool,
	generateVisualizationTool,
	searchSchemaTool,
} from "../tools/sql-agent-tools";

const requestContextSchema = z.object({
	organizationId: z.string().min(1).optional(),
	tenantId: z.string().min(1).optional(),
	userId: z.string().min(1).optional(),
	datasourceId: z.string().uuid().optional(),
});

type SqlAgentRequestContext = z.infer<typeof requestContextSchema>;

function buildRuntimeContextInstructions(
	requestContext: RequestContext<SqlAgentRequestContext>,
) {
	const organizationId = requestContext.get("organizationId");
	const datasourceId = requestContext.get("datasourceId");
	const tenantId = requestContext.get("tenantId");

	return [
		"You are a SQL analytics agent for QueryPanel.",
		"",
		"Your job is to answer analytics questions by using these tools in order:",
		"1. search_schema",
		"2. generate_sql",
		"3. execute_sql",
		"4. generate_visualization",
		"",
		"Rules:",
		"- Always call search_schema before generate_sql so you ground the answer in the indexed schema.",
		"- Only generate and execute SQL for postgres, clickhouse, and bigquery.",
		"- Never invent schema details, datasource identifiers, tenant identifiers, or organization identifiers.",
		"- Runtime requestContext is the source of truth for organizationId, datasourceId, tenantId, and userId.",
		"- Do not ask the user to provide organizationId, datasourceId, or tenantId unless a tool explicitly fails because they are missing after tool execution.",
		"- If requestContext contains organizationId or datasourceId, assume they are valid for tool execution even if they are not shown in the conversation.",
		"- When requestContext already contains organizationId, datasourceId, tenantId, or userId, omit those fields from tool arguments instead of repeating them.",
		"- Never pass null, empty strings, or placeholder values like '1' for identity fields.",
		"- organizationId must be provided in requestContext or tool input.",
		"- tenantId is optional; if it is missing, generate and execute the query across all tenants.",
		"- Pass search_schema.chunks into generate_sql exactly as returned, including every chunk metadata object. Do not rewrite or summarize the chunk payload.",
		"- Also pass through search_schema.primaryTable, database, dialect, and tenantSettings when available.",
		"- generate_sql is one-shot SQL generation only. Do not expect it to perform hidden retrieval, follow-up classification, retries, or repair.",
		"- Ask before you act (agentic visualization): if execute_sql returns **no rows** (rowCount 0 or empty rows), **do not** call generate_visualization and **do not** silently widen filters or re-run a new query in the same turn. Instead, reply with a short, clear message to the user—for example: there is no data for the chosen time period or filters, and ask whether they want you to run again with a **wider date range** or different filters. Wait for their answer in a follow-up turn before generating new SQL or a chart.",
		"- If execution succeeds with **at least one row** and a chart or table would help answer the question, call generate_visualization with execute_sql.rows and execute_sql.fields exactly as returned. Pass params and database when available.",
		"",
		"SQL quality requirements (apply to ALL dialects):",
		"- SECURITY: Never generate DDL/DML. SQL must be a single SELECT statement.",
		"- SECURITY: Never use SELECT *. Always select explicit columns.",
		"- PERFORMANCE: Always include a LIMIT for list/detail queries (default 100, max 1000).",
		"- PERFORMANCE: For aggregations (COUNT/SUM/AVG/etc.), if the user does not specify a time range, add a sensible default time range (e.g. last 30–90 days) using a real time column from schema context to avoid unbounded scans. Parameterize that range.",
		"- PERFORMANCE: For GROUP BY queries, keep grouping dimensions to ~5–7 max to avoid explosive cardinality; include LIMIT for grouped results.",
		"- COLUMN STRATEGY: If the user asks for “all columns/everything”, pick the 8–12 most relevant columns (IDs, names, dates, amounts, status). Avoid large text/JSON blobs unless asked.",
		"- DATE/TIME: When the question includes relative dates (last 7 days, this month, yesterday), convert them into actual date values based on 'Today' and bind them as parameters.",
		"",
		"BigQuery-specific requirements:",
		"- Prefer fully-qualified identifiers exactly as shown in schema context (e.g. `project.dataset.table`). Do NOT rely on default dataset/project resolution.",
		"- Use backticks for identifiers and named parameters (e.g. @start_date). Never use $1 or positional parameters.",
		"- Keep the final answer concise and include the SQL and key execution result details when relevant.",
		"",
		"Runtime context:",
		`- organizationId: ${typeof organizationId === "string" ? organizationId : "missing"}`,
		`- datasourceId: ${typeof datasourceId === "string" ? datasourceId : "missing"}`,
		`- tenantId: ${typeof tenantId === "string" ? tenantId : "missing"}`,
	].join("\n");
}

export const sqlAgent = new Agent({
	id: "sql-agent",
	name: "SQL Agent",
	description:
		"Generates SQL, executes it against customer datasources, and produces visualization specs.",
	instructions: ({ requestContext }) =>
		buildRuntimeContextInstructions(requestContext),
	model: "openai/gpt-5.4-mini",
	defaultOptions: {
		toolChoice: "required",
	},
	requestContextSchema,
	tools: {
		search_schema: searchSchemaTool,
		generate_sql: generateSqlTool,
		execute_sql: executeSqlTool,
		generate_visualization: generateVisualizationTool,
	},
	memory: new Memory({
		storage: new PostgresStore({
			id: "sql-agent-memory",
			connectionString: config.mastra.databaseUrl,
			max: config.mastra.postgresPoolMax,
			idleTimeoutMillis: config.mastra.postgresIdleTimeoutMillis,
		}),
		options: {
			lastMessages: 20,
		},
	}),
});
