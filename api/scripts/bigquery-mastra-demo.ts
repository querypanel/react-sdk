import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import type {
	BigQueryClientFn,
	BigQueryQueryResult,
} from "@querypanel/node-sdk";
import { QueryPanelSdkAPI } from "@querypanel/node-sdk";

const DEFAULT_BASE_URL =
	process.env.QUERYPANEL_BASE_URL ?? "http://localhost:3001";
const DEFAULT_ORGANIZATION_ID = "e62f7e03-a96e-4dc8-8e3b-137163e20c97";
const DEFAULT_TENANT_ID = process.env.BQ_TENANT_ID ?? "github";
const DEFAULT_PROMPT =
	process.env.BQ_PROMPT ??
	"show me created repositories over time from 2008 through 2012 (bucket by month)";
const DEFAULT_DATABASE = "samples";
const DEFAULT_ALLOWED_TABLE = "github_timeline";
const DEFAULT_DATASOURCE_ID =
	process.env.QUERYPANEL_DATASOURCE_ID ??
	"d4a6ee2c-d568-4899-84f1-63f077c4a5fb";
const DEFAULT_DATASET = process.env.BQ_DATASET ?? "samples";
const DEFAULT_LOCATION = process.env.BQ_LOCATION ?? "US";
const DEFAULT_PROJECT_ID =
	process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "querypanel";
const DEFAULT_QUERY_PROJECT_ID = process.env.BQ_PROJECT_ID ?? "querypanel";
const DEFAULT_DATASET_PROJECT_ID =
	process.env.BQ_DATASET_PROJECT_ID ?? "bigquery-public-data";
const EVAL_RUNS = Number(process.env.MASTRA_EVAL_RUNS ?? "1");
const EVAL_DELAY_MS = Number(process.env.MASTRA_EVAL_DELAY_MS ?? "0");

const PRIVATE_KEY =
	"-----BEGIN PRIVATE KEY-----\n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\nbKAhGPeXR7C8RGog+i0BcqmVCrFJeg==\n-----END PRIVATE KEY-----\n";

type MastraStreamChunk = {
	type?: string;
	textDelta?: string;
	text?: string;
	toolName?: string;
	result?: unknown;
	payload?: Record<string, unknown>;
	response?: {
		messages?: Array<{
			role?: string;
			content?: Array<{
				type?: string;
				text?: string;
				result?: unknown;
				toolName?: string;
			}>;
		}>;
	};
};

type EvalStages = {
	bigQueryOk: boolean;
	apiOk: boolean;
	schemaSyncOk: boolean;
	jwtOk: boolean;
	sqlGenerated: boolean;
	queryExecuted: boolean;
	chartGenerated: boolean;
	assistantResponded: boolean;
	sqlExpectationOk: boolean;
	outputExpectationOk: boolean;
	chartExpectationOk: boolean;
};

type RunSummary = {
	index: number;
	durationMs: number;
	success: boolean;
	errorMessage: string | null;
	stages: EvalStages;
	expectationFailures: string[];
};

type ExpectedSpec = {
	tableName: string;
	tenantFieldName: string;
	tenantValue: string;
	timeFieldName: string;
	expectedMetricFieldNames: string[];
	minRowCount: number;
};

type AgentArtifacts = {
	sql: string | null;
	params: Array<Record<string, unknown>>;
	queryFields: string[];
	queryRows: Array<Record<string, unknown>>;
	chartGenerated: boolean;
	assistantText: string;
};

const EXPECTED: ExpectedSpec = {
	tableName: "github_timeline",
	tenantFieldName: "repository_organization",
	tenantValue: "github",
	timeFieldName: "repository_created_at",
	expectedMetricFieldNames: ["repository_count", "count"],
	minRowCount: 2,
};

const bigquery = new BigQuery(
	DEFAULT_PROJECT_ID ? { projectId: DEFAULT_PROJECT_ID } : undefined,
);

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function getErrorDetails(error: unknown) {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}

	const cause =
		error.cause instanceof Error
			? {
					name: error.cause.name,
					message: error.cause.message,
				}
			: error.cause;

	return {
		name: error.name,
		message: error.message,
		stack: error.stack,
		cause,
	};
}

function shouldLogMastraEvent(chunk: MastraStreamChunk) {
	switch (chunk.type) {
		case "start":
		case "finish":
		case "step-start":
		case "step-finish":
		case "tool-call":
		case "tool-result":
		case "tool-call-input-streaming-start":
		case "tool-call-input-streaming-end":
			return true;
		default:
			return false;
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function printRunSummary(summary: RunSummary) {
	console.log(`\nEval Summary: run ${summary.index}/${EVAL_RUNS}`);
	console.log(`  duration_ms: ${summary.durationMs}`);
	console.log(`  success: ${summary.success}`);
	console.log(`  bigquery_ok: ${summary.stages.bigQueryOk}`);
	console.log(`  api_ok: ${summary.stages.apiOk}`);
	console.log(`  schema_sync_ok: ${summary.stages.schemaSyncOk}`);
	console.log(`  jwt_ok: ${summary.stages.jwtOk}`);
	console.log(`  sql_generated: ${summary.stages.sqlGenerated}`);
	console.log(`  query_executed: ${summary.stages.queryExecuted}`);
	console.log(`  chart_generated: ${summary.stages.chartGenerated}`);
	console.log(`  assistant_responded: ${summary.stages.assistantResponded}`);
	console.log(`  sql_expectation_ok: ${summary.stages.sqlExpectationOk}`);
	console.log(`  output_expectation_ok: ${summary.stages.outputExpectationOk}`);
	console.log(`  chart_expectation_ok: ${summary.stages.chartExpectationOk}`);
	if (summary.errorMessage) {
		console.log(`  error: ${summary.errorMessage}`);
	}
	if (summary.expectationFailures.length > 0) {
		console.log("  expectation_failures:");
		for (const failure of summary.expectationFailures) {
			console.log(`    - ${failure}`);
		}
	}
}

function printOverallSummary(summaries: RunSummary[]) {
	if (summaries.length <= 1) {
		return;
	}

	const passed = summaries.filter((summary) => summary.success).length;
	const avgDurationMs = Math.round(
		summaries.reduce((sum, summary) => sum + summary.durationMs, 0) /
			summaries.length,
	);

	console.log("\nOverall Eval Summary");
	console.log(`  runs: ${summaries.length}`);
	console.log(`  passed: ${passed}`);
	console.log(`  failed: ${summaries.length - passed}`);
	console.log(
		`  success_rate: ${((passed / Math.max(summaries.length, 1)) * 100).toFixed(1)}%`,
	);
	console.log(`  avg_duration_ms: ${avgDurationMs}`);
}

function evaluateExpectations(artifacts: AgentArtifacts) {
	const failures: string[] = [];
	const sql = artifacts.sql ?? "";
	const lowerSql = sql.toLowerCase();

	const sqlExpectationOk = Boolean(sql) &&
		lowerSql.includes(EXPECTED.tableName.toLowerCase()) &&
		lowerSql.includes(EXPECTED.tenantFieldName.toLowerCase()) &&
		lowerSql.includes(EXPECTED.timeFieldName.toLowerCase()) &&
		EXPECTED.expectedMetricFieldNames.some((field) =>
			lowerSql.includes(field.toLowerCase()),
		);

	if (!artifacts.sql) {
		failures.push("SQL was missing from generate_sql output.");
	} else {
		if (!lowerSql.includes(EXPECTED.tableName.toLowerCase())) {
			failures.push(`SQL did not reference expected table ${EXPECTED.tableName}.`);
		}
		if (!lowerSql.includes(EXPECTED.tenantFieldName.toLowerCase())) {
			failures.push(
				`SQL did not include expected tenant field ${EXPECTED.tenantFieldName}.`,
			);
		}
		if (!lowerSql.includes(EXPECTED.timeFieldName.toLowerCase())) {
			failures.push(
				`SQL did not reference expected time field ${EXPECTED.timeFieldName}.`,
			);
		}
		if (
			!EXPECTED.expectedMetricFieldNames.some((field) =>
				lowerSql.includes(field.toLowerCase()),
			)
		) {
			failures.push("SQL did not include the expected count metric field.");
		}
	}

	const lowerFields = artifacts.queryFields.map((field) => field.toLowerCase());
	const hasTimeBucketField = lowerFields.some(
		(field) =>
			field === "day" ||
			field.includes("date") ||
			field.includes("month") ||
			field.includes("week") ||
			field.includes("year"),
	);
	const hasMetricField = lowerFields.some((field) => {
		// Keep this flexible: model may name the metric repository_count, total_repositories, repo_count, etc.
		if (field.includes("count")) return true;
		if (field.includes("repositories")) return true;
		if (field.includes("repo") && (field.includes("count") || field.includes("created")))
			return true;
		if (field.includes("created") && !field.includes("date")) return true;
		return EXPECTED.expectedMetricFieldNames.some(
			(expectedField) => field === expectedField.toLowerCase(),
		);
	});
	const outputExpectationOk =
		artifacts.queryRows.length >= EXPECTED.minRowCount &&
		hasTimeBucketField &&
		hasMetricField;

	if (artifacts.queryRows.length < EXPECTED.minRowCount) {
		failures.push(
			`Query returned ${artifacts.queryRows.length} rows, expected at least ${EXPECTED.minRowCount}.`,
		);
	}
	if (!hasTimeBucketField) {
		failures.push(
			"Query result did not contain a time-bucket output field (expected day/date/month/week/year in column names).",
		);
	}
	if (!hasMetricField) {
		failures.push(
			"Query result did not contain an expected metric field (count/repo_count/repositories_created).",
		);
	}

	const tenantBoundInParams = artifacts.params.some((param) => {
		const name = typeof param.name === "string" ? param.name : "";
		const value = typeof param.value === "string" ? param.value : param.value;
		return (
			(name === EXPECTED.tenantFieldName || name === "tenant_id") &&
			String(value).toLowerCase() === EXPECTED.tenantValue.toLowerCase()
		);
	});
	const lowerSqlForTenant = (artifacts.sql ?? "").toLowerCase();
	const tenantInSql =
		lowerSqlForTenant.includes(EXPECTED.tenantFieldName.toLowerCase()) &&
		lowerSqlForTenant.includes(EXPECTED.tenantValue.toLowerCase());
	const tenantIsolationOk = tenantBoundInParams || tenantInSql;

	const chartExpectationOk =
		artifacts.chartGenerated && tenantIsolationOk;

	if (!artifacts.chartGenerated) {
		failures.push("Chart generation did not succeed.");
	}
	// Assistant text is optional; some successful tool runs may end without a final text response.
	if (!tenantIsolationOk) {
		failures.push(
			`Tenant isolation not found: expected param (${EXPECTED.tenantFieldName} or tenant_id)=${EXPECTED.tenantValue}, or SQL referencing both.`,
		);
	}

	return {
		sqlExpectationOk,
		outputExpectationOk,
		chartExpectationOk,
		failures,
	};
}

async function fetchWithDiagnostics(
	url: string,
	init?: RequestInit,
	label?: string,
) {
	const startedAt = Date.now();
	const tag = label ?? "fetch";
	console.log(`\n[${tag}] request`);
	console.log(
		JSON.stringify(
			{
				url,
				method: init?.method ?? "GET",
				headers: init?.headers ?? {},
			},
			null,
			2,
		),
	);

	try {
		const response = await fetch(url, init);
		console.log(
			`[${tag}] response ${response.status} ${response.statusText} (${Date.now() - startedAt}ms)`,
		);
		return response;
	} catch (error) {
		console.error(`[${tag}] network error after ${Date.now() - startedAt}ms`);
		console.error(JSON.stringify(getErrorDetails(error), null, 2));
		throw error;
	}
}

const createBigQueryClientFn = (): BigQueryClientFn => {
	return async (
		request: Parameters<BigQueryClientFn>[0],
	): Promise<BigQueryQueryResult> => {
		const options: Parameters<typeof bigquery.createQueryJob>[0] = {
			query: request.query,
			location: DEFAULT_LOCATION,
			defaultDataset: {
				projectId: DEFAULT_DATASET_PROJECT_ID,
				datasetId: DEFAULT_DATASET,
			},
		};

		if (request.params && Object.keys(request.params).length > 0) {
			options.params = request.params as Record<string, unknown>;
		}

		if (request.dryRun) {
			options.dryRun = true;
		}

		const [job] = await bigquery.createQueryJob(options);

		if (request.dryRun) {
			return { rows: [], fields: [] };
		}

		const [rows] = await job.getQueryResults();
		const normalized = rows.map((row) => {
			const out: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(
				row as Record<string, unknown>,
			)) {
				out[key] =
					typeof value === "object" && value !== null && "value" in value
						? (value as { value: unknown }).value
						: value;
			}
			return out;
		});

		const fields =
			normalized.length > 0
				? (Object.keys(normalized[0] as Record<string, unknown>) as string[])
				: [];

		return { rows: normalized, fields };
	};
};

function normalizeMastraChunk(raw: MastraStreamChunk): MastraStreamChunk {
	const payload = raw.payload;
	if (payload && typeof payload === "object" && !Array.isArray(payload)) {
		const merged = { ...raw, ...payload } as MastraStreamChunk;
		delete (merged as { payload?: unknown }).payload;
		if (
			merged.type === "text-delta" &&
			typeof merged.textDelta !== "string" &&
			typeof (payload as { text?: unknown }).text === "string"
		) {
			merged.textDelta = (payload as { text: string }).text;
		}
		if (
			merged.type === "step-finish" &&
			!merged.response &&
			Array.isArray((payload as { messages?: unknown }).messages)
		) {
			merged.response = {
				messages: (
					payload as {
						messages: NonNullable<MastraStreamChunk["response"]>["messages"];
					}
				).messages,
			};
		}
		return merged;
	}

	if (
		raw.type === "text-delta" &&
		typeof raw.textDelta !== "string" &&
		typeof raw.text === "string"
	) {
		return { ...raw, textDelta: raw.text };
	}

	return raw;
}

function extractToolResultsFromChunk(chunk: MastraStreamChunk) {
	const results: Array<{ toolName: string; result: Record<string, unknown> }> =
		[];

	for (const message of chunk.response?.messages ?? []) {
		for (const part of message.content ?? []) {
			if (
				typeof part.toolName === "string" &&
				part.toolName.trim().length > 0 &&
				part.result &&
				typeof part.result === "object" &&
				!Array.isArray(part.result)
			) {
				results.push({
					toolName: part.toolName.trim(),
					result: part.result as Record<string, unknown>,
				});
			}
		}
	}

	return results;
}

async function verifyBigQueryAccess() {
	await bigquery.createQueryJob({
		query: `SELECT 1 AS n FROM \`${DEFAULT_DATASET_PROJECT_ID}.${DEFAULT_DATASET}.INFORMATION_SCHEMA.TABLES\` LIMIT 1`,
		defaultDataset: {
			projectId: DEFAULT_DATASET_PROJECT_ID,
			datasetId: DEFAULT_DATASET,
		},
		location: DEFAULT_LOCATION,
		dryRun: true,
	});
}

async function verifyApiAccess(baseUrl: string) {
	const healthUrl = `${baseUrl.replace(/\/$/, "")}/healthz`;
	const response = await fetchWithDiagnostics(healthUrl, undefined, "healthz");
	const body = await response.text().catch(() => "");
	console.log("[healthz] body");
	console.log(body || "(empty)");

	if (!response.ok) {
		throw new Error(
			`API health check failed: ${response.status} ${response.statusText}`,
		);
	}
}

async function invokeMastraAgent(args: {
	baseUrl: string;
	token: string;
	organizationId: string;
	datasourceId: string;
	tenantId: string;
	prompt: string;
}) {
	const threadId = `bigquery-mastra-demo-${Date.now()}`;
	const resourceId = `script-${args.organizationId}-bigquery-demo`;
	const requestBody = {
		messages: args.prompt,
		memory: {
			thread: threadId,
			resource: resourceId,
		},
		requestContext: {
			organizationId: args.organizationId,
			datasourceId: args.datasourceId,
			tenantId: args.tenantId,
			userId: "bigquery-mastra-demo",
		},
		savePerStep: true,
	};

	console.log("\n[mastra-agent] request body");
	console.log(JSON.stringify(requestBody, null, 2));

	const response = await fetchWithDiagnostics(
		`${args.baseUrl}/api/agents/sql-agent/stream`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${args.token}`,
			},
			body: JSON.stringify(requestBody),
		},
		"mastra-agent",
	);

	if (!response.ok || !response.body) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Mastra agent request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
		);
	}

	const decoder = new TextDecoder();
	const reader = response.body.getReader();
	let buffer = "";
	let done = false;
	let assistantText = "";
	let sawChart = false;
	let sawSql = false;
	let sawQueryData = false;
	let generatedSql: string | null = null;
	let generatedParams: Array<Record<string, unknown>> = [];
	let queryFields: string[] = [];
	let queryRows: Array<Record<string, unknown>> = [];

	const handleToolResult = (
		toolName: string,
		result: Record<string, unknown>,
	) => {
		if (toolName === "generate_sql") {
			sawSql = typeof result.sql === "string" && result.sql.trim().length > 0;
			generatedSql = typeof result.sql === "string" ? result.sql : null;
			generatedParams = Array.isArray(result.params)
				? (result.params as Array<Record<string, unknown>>)
				: [];
			console.log("\nGenerated SQL:");
			console.log(typeof result.sql === "string" ? result.sql : "(missing)");
			if (Array.isArray(result.params) && result.params.length > 0) {
				console.log("\nParameters:");
				console.log(JSON.stringify(result.params, null, 2));
			}
			return;
		}

		if (toolName === "execute_sql") {
			sawQueryData = true;
			const rows = Array.isArray(result.rows)
				? (result.rows as Array<Record<string, unknown>>)
				: [];
			const fields = Array.isArray(result.fields)
				? (result.fields as string[])
				: [];
			queryRows = rows;
			queryFields = fields;
			console.log("\nQuery Data:");
			console.log(
				JSON.stringify(
					{
						rowCount:
							typeof result.rowCount === "number"
								? result.rowCount
								: rows.length,
						fields,
					},
					null,
					2,
				),
			);
			console.table(rows.slice(0, 10));
			return;
		}

		if (toolName === "generate_visualization") {
			sawChart = Boolean(result.spec);
			console.log(
				`\nVisualization: ${sawChart ? "chart spec generated" : "no chart spec returned"}`,
			);
		}
	};

	while (!done) {
		const read = await reader.read();
		done = read.done;
		buffer += decoder.decode(read.value ?? new Uint8Array(), {
			stream: !read.done,
		});

		let boundaryIndex = buffer.indexOf("\n\n");
		while (boundaryIndex !== -1) {
			const rawEvent = buffer.slice(0, boundaryIndex);
			buffer = buffer.slice(boundaryIndex + 2);
			boundaryIndex = buffer.indexOf("\n\n");

			const payload = rawEvent
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");

			if (!payload || payload === "[DONE]") {
				continue;
			}

			const chunk = normalizeMastraChunk(
				JSON.parse(payload) as MastraStreamChunk,
			);
			if (shouldLogMastraEvent(chunk)) {
				console.log(
					"[mastra-agent] event",
					JSON.stringify(
						{
							type: chunk.type ?? null,
							toolName: chunk.toolName ?? null,
							hasResult:
								Boolean(chunk.result) ||
								extractToolResultsFromChunk(chunk).length > 0,
							textDeltaLength:
								typeof chunk.textDelta === "string"
									? chunk.textDelta.length
									: 0,
						},
						null,
						2,
					),
				);
			}

			if (chunk.type === "text-delta" && typeof chunk.textDelta === "string") {
				assistantText += chunk.textDelta;
				continue;
			}

			if (
				chunk.type === "tool-result" &&
				typeof chunk.toolName === "string" &&
				chunk.result &&
				typeof chunk.result === "object" &&
				!Array.isArray(chunk.result)
			) {
				handleToolResult(
					chunk.toolName,
					chunk.result as Record<string, unknown>,
				);
				continue;
			}

			if (chunk.type === "step-finish") {
				for (const result of extractToolResultsFromChunk(chunk)) {
					handleToolResult(result.toolName, result.result);
				}
			}
		}
	}

	if (assistantText.trim()) {
		console.log("\nAssistant:");
		console.log(assistantText.trim());
	}

	if (!assistantText.trim() && !sawChart) {
		console.warn(
			"\nWarning: stream completed without assistant text or visualization output.",
		);
	}

	return {
		sqlGenerated: sawSql,
		queryExecuted: sawQueryData,
		chartGenerated: sawChart,
		assistantResponded: assistantText.trim().length > 0,
		sql: generatedSql,
		params: generatedParams,
		queryFields,
		queryRows,
		assistantText,
	};
}

async function runOnce(index: number): Promise<RunSummary> {
	const startedAt = Date.now();
	const stages: EvalStages = {
		bigQueryOk: false,
		apiOk: false,
		schemaSyncOk: false,
		jwtOk: false,
		sqlGenerated: false,
		queryExecuted: false,
		chartGenerated: false,
		assistantResponded: false,
		sqlExpectationOk: false,
		outputExpectationOk: false,
		chartExpectationOk: false,
	};

	console.log(`BigQuery Mastra Demo\n`);
	console.log(`   Run: ${index}/${EVAL_RUNS}`);
	console.log(`   Base URL: ${DEFAULT_BASE_URL}`);
	console.log(`   Workspace: ${DEFAULT_ORGANIZATION_ID}`);
	console.log(`   Prompt: ${DEFAULT_PROMPT}`);
	console.log(
		`   Dataset: ${DEFAULT_DATASET_PROJECT_ID}.${DEFAULT_DATASET} (${DEFAULT_LOCATION})\n`,
	);
	console.log(`   Datasource ID: ${DEFAULT_DATASOURCE_ID}`);
	console.log(`   Tenant ID: ${DEFAULT_TENANT_ID}`);
	console.log(`   Query Project: ${DEFAULT_QUERY_PROJECT_ID}`);
	console.log(`   Attach Project: ${DEFAULT_PROJECT_ID}\n`);

	if (!DEFAULT_PROJECT_ID) {
		throw new Error(
			"Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT before running this script.",
		);
	}

	console.log("[preflight] verifying BigQuery access...");
	await verifyBigQueryAccess();
	stages.bigQueryOk = true;
	console.log("[preflight] BigQuery connection and permissions OK");

	console.log("[preflight] verifying QueryPanel API access...");
	try {
		await verifyApiAccess(DEFAULT_BASE_URL);
		stages.apiOk = true;
		console.log("[preflight] QueryPanel API is reachable");
	} catch (error) {
		console.error("\n[preflight] QueryPanel API is not reachable");
		console.error(JSON.stringify(getErrorDetails(error), null, 2));
		throw new Error(
			`Could not reach QueryPanel API at ${DEFAULT_BASE_URL}. Start querypanel-sdk with \`bun run dev\` and retry.`,
		);
	}

	const qp = new QueryPanelSdkAPI(
		DEFAULT_BASE_URL,
		PRIVATE_KEY,
		DEFAULT_ORGANIZATION_ID,
		{
			defaultTenantId: DEFAULT_TENANT_ID,
		},
	);

	qp.attachBigQuery(DEFAULT_DATABASE, createBigQueryClientFn(), {
		projectId: DEFAULT_QUERY_PROJECT_ID,
		datasetProjectId: DEFAULT_DATASET_PROJECT_ID,
		dataset: DEFAULT_DATASET,
		location: DEFAULT_LOCATION,
		database: DEFAULT_DATABASE,
		description: "BigQuery Mastra SQL agent demo",
		allowedTables: [DEFAULT_ALLOWED_TABLE],
		tenantFieldName: "repository_organization",
		tenantFieldType: "String",
		enforceTenantIsolation: true,
	});

	console.log("\n[sync] starting schema sync");
	console.log(
		JSON.stringify(
			{
				database: DEFAULT_DATABASE,
				tenantId: DEFAULT_TENANT_ID,
				baseUrl: DEFAULT_BASE_URL,
			},
			null,
			2,
		),
	);
	let syncResult: Awaited<ReturnType<typeof qp.syncSchema>>;
	try {
		syncResult = await qp.syncSchema(DEFAULT_DATABASE, {
			tenantId: DEFAULT_TENANT_ID,
		});
	} catch (error) {
		console.error("\n[sync] schema sync failed");
		console.error(JSON.stringify(getErrorDetails(error), null, 2));
		throw error;
	}

	if (syncResult.skipped) {
		console.log("Schema unchanged; skipping ingestion");
	} else {
		console.log(`Schema synced (${syncResult.chunks} chunks created)`);
	}
	stages.schemaSyncOk = true;

	console.log("\n[jwt] creating JWT for agent request...");
	let token: string;
	try {
		token = await qp.createJwt({
			tenantId: DEFAULT_TENANT_ID,
			userId: "bigquery-mastra-demo",
		});
	} catch (error) {
		console.error("\n[jwt] failed to create JWT");
		console.error(JSON.stringify(getErrorDetails(error), null, 2));
		throw error;
	}
	stages.jwtOk = true;
	console.log(`[jwt] token created (${token.length} chars)`);

	console.log(`Using datasource: ${DEFAULT_DATASOURCE_ID}`);

	console.log("\n[agent] invoking Mastra SQL agent...");
	try {
		const agentResult = await invokeMastraAgent({
			baseUrl: DEFAULT_BASE_URL,
			token,
			organizationId: DEFAULT_ORGANIZATION_ID,
			datasourceId: DEFAULT_DATASOURCE_ID,
			tenantId: DEFAULT_TENANT_ID,
			prompt: DEFAULT_PROMPT,
		});
		stages.sqlGenerated = agentResult.sqlGenerated;
		stages.queryExecuted = agentResult.queryExecuted;
		stages.chartGenerated = agentResult.chartGenerated;
		stages.assistantResponded =
			agentResult.assistantResponded || agentResult.chartGenerated;
		const expectationCheck = evaluateExpectations(agentResult);
		stages.sqlExpectationOk = expectationCheck.sqlExpectationOk;
		stages.outputExpectationOk = expectationCheck.outputExpectationOk;
		stages.chartExpectationOk = expectationCheck.chartExpectationOk;
		const expectationFailures = expectationCheck.failures;
		const summary: RunSummary = {
			index,
			durationMs: Date.now() - startedAt,
			success: Object.values(stages).every(Boolean),
			errorMessage: null,
			stages,
			expectationFailures,
		};
		console.log("\nExpected Spec");
		console.log(JSON.stringify(EXPECTED, null, 2));
		printRunSummary(summary);
		return summary;
	} catch (error) {
		console.error("\n[agent] invocation failed");
		console.error(JSON.stringify(getErrorDetails(error), null, 2));
		throw error;
	}
}

async function main() {
	const summaries: RunSummary[] = [];

	for (let index = 1; index <= EVAL_RUNS; index += 1) {
		try {
			const summary = await runOnce(index);
			summaries.push(summary);
		} catch (error) {
			const summary: RunSummary = {
				index,
				durationMs: 0,
				success: false,
				errorMessage: getErrorMessage(error),
				stages: {
					bigQueryOk: false,
					apiOk: false,
					schemaSyncOk: false,
					jwtOk: false,
					sqlGenerated: false,
					queryExecuted: false,
					chartGenerated: false,
					assistantResponded: false,
					sqlExpectationOk: false,
					outputExpectationOk: false,
					chartExpectationOk: false,
				},
				expectationFailures: [],
			};
			printRunSummary(summary);
			summaries.push(summary);
		}

		if (index < EVAL_RUNS && EVAL_DELAY_MS > 0) {
			await sleep(EVAL_DELAY_MS);
		}
	}

	printOverallSummary(summaries);

	if (summaries.some((summary) => !summary.success)) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error("\nError:", getErrorMessage(error));
	process.exitCode = 1;
});
