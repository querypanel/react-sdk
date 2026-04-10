import type { QueryParams } from "@clickhouse/client";
import { createClient } from "@clickhouse/client";
import "dotenv/config";
import {
  type ClickHouseClientFn,
  QueryPanelSdkAPI,
} from "@querypanel/node-sdk";

const DEFAULT_BASE_URL =
	process.env.QUERYPANEL_BASE_URL ?? "http://localhost:3001";
const DEFAULT_ORGANIZATION_ID = "02fbbef9-c692-494c-aa53-8e8202829aad";
const DEFAULT_TENANT_ID = process.env.CH_TENANT_ID ?? "tenant_a";
const DEFAULT_PROMPT =
	process.env.CH_PROMPT ?? "What is my total revenue in the last 30 days?";
const DEFAULT_DATABASE = process.env.CH_DATABASE ?? "demo";
const DEFAULT_CLICKHOUSE_URL =
	process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const DEFAULT_CLICKHOUSE_USERNAME = process.env.CLICKHOUSE_USERNAME ?? "demo";
const DEFAULT_CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "demo123";
const DEFAULT_CLICKHOUSE_DB = process.env.CLICKHOUSE_DB ?? "demo";
const EVAL_RUNS = Number(process.env.MASTRA_EVAL_RUNS ?? "1");
const EVAL_DELAY_MS = Number(process.env.MASTRA_EVAL_DELAY_MS ?? "0");
/** Default on: re-embed schema chunks so local runs are not poisoned by stale column vectors. Set CH_FORCE_REINDEX=0 to skip. */
const CH_FORCE_REINDEX = process.env.CH_FORCE_REINDEX !== "0";

const PRIVATE_KEY =
	"-----BEGIN PRIVATE KEY-----\n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\nbKAhGPeXR7C8RGog+i0BcqmVCrFJeg==\n-----END PRIVATE KEY-----\n";

// ClickHouse client — uses same defaults as CLICKHOUSE_* / CH_* config log below
const client = createClient({
	url: DEFAULT_CLICKHOUSE_URL,
	username: DEFAULT_CLICKHOUSE_USERNAME,
	password: DEFAULT_CLICKHOUSE_PASSWORD,
	database: DEFAULT_CLICKHOUSE_DB,
});

type EvalStages = {
	clickhouseOk: boolean;
	apiOk: boolean;
	seedOk: boolean;
	schemaSyncOk: boolean;
	sqlGenerated: boolean;
	queryExecuted: boolean;
	chartGenerated: boolean;
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
	tenantFieldName: string;
	tenantValue: string;
	dateFieldName: string;
	forbiddenFieldNames: string[];
	minRowCount: number;
};

const EXPECTED: ExpectedSpec = {
	tenantFieldName: "tenant_id",
	tenantValue: DEFAULT_TENANT_ID,
	dateFieldName: "order_date",
	forbiddenFieldNames: ["created_at"],
	minRowCount: 1,
};

function getErrorMessage(error: unknown): string {
	if (error instanceof AggregateError) {
		const parts = Array.from(error.errors ?? [])
			.map((e) => (e instanceof Error ? e.message : String(e)))
			.filter((s) => s.trim().length > 0);
		return parts.length > 0 ? parts.join(" | ") : error.message;
	}
	if (error instanceof Error) return error.message;
	return String(error);
}

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyApiAccess(baseUrl: string) {
	const healthUrl = `${baseUrl.replace(/\/$/, "")}/healthz`;
	const response = await fetch(healthUrl);
	const body = await response.text().catch(() => "");
	console.log("[healthz] body");
	console.log(body || "(empty)");
	if (!response.ok) {
		throw new Error(
			`API health check failed: ${response.status} ${response.statusText}`,
		);
	}
}

function printRunSummary(summary: RunSummary) {
	console.log(`\nEval Summary: run ${summary.index}/${EVAL_RUNS}`);
	console.log(`  duration_ms: ${summary.durationMs}`);
	console.log(`  success: ${summary.success}`);
	console.log(`  clickhouse_ok: ${summary.stages.clickhouseOk}`);
	console.log(`  api_ok: ${summary.stages.apiOk}`);
	console.log(`  seed_ok: ${summary.stages.seedOk}`);
	console.log(`  schema_sync_ok: ${summary.stages.schemaSyncOk}`);
	console.log(`  sql_generated: ${summary.stages.sqlGenerated}`);
	console.log(`  query_executed: ${summary.stages.queryExecuted}`);
	console.log(`  chart_generated: ${summary.stages.chartGenerated}`);
	console.log(`  sql_expectation_ok: ${summary.stages.sqlExpectationOk}`);
	console.log(`  output_expectation_ok: ${summary.stages.outputExpectationOk}`);
	console.log(`  chart_expectation_ok: ${summary.stages.chartExpectationOk}`);
	if (summary.errorMessage) console.log(`  error: ${summary.errorMessage}`);
	if (summary.expectationFailures.length > 0) {
		console.log("  expectation_failures:");
		for (const failure of summary.expectationFailures) {
			console.log(`    - ${failure}`);
		}
	}
}

function printOverallSummary(summaries: RunSummary[]) {
	if (summaries.length <= 1) return;
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

async function seed() {
  try {
    // Drop and recreate the orders table
    await client.command({
      query: "DROP TABLE IF EXISTS orders",
    });

    await client.command({
      query: `
        CREATE TABLE orders (
          id UInt32,
          tenant_id String,
          user_id String,
          amount Decimal(10, 2),
          order_date DateTime
        ) ENGINE = MergeTree()
        ORDER BY id
      `,
    });

    // Insert 50 rows
    const tenants = ["tenant_a", "tenant_b"];
    const values: Array<{
      id: number;
      tenant_id: string;
      user_id: string;
      amount: string;
      order_date: string;
    }> = [];

    for (let i = 1; i <= 50; i += 1) {
      const tenant = tenants[i % tenants.length];
      const userId = `user_${(i % 10) + 1}`;
      const amount = (Math.random() * 1000 + 10).toFixed(2);
      const date = new Date(
        Date.now() - Math.floor(Math.random() * 30) * 86400000,
      )
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, ""); // Remove milliseconds and Z
      values.push({
        id: i,
        tenant_id: tenant,
        user_id: userId,
        amount: amount,
        order_date: date,
      });
    }

    await client.insert({
      table: "orders",
      values: values,
      format: "JSONEachRow",
    });

    console.log("✅ Seeded 50 orders into ClickHouse");
  } catch (error) {
    console.error("Error seeding data:", error);
    throw error;
  }
}

// Create a ClickHouseClientFn for the SDK
const createClickHouseClientFn = (): ClickHouseClientFn => {
  return async (params: QueryParams) => {
    const resultSet = await client.query({
      query: params.query,
      format: "JSONEachRow",
      query_params: params.query_params,
    });
    const rows = await resultSet.json();
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  };
};

async function runOnce(args: {
	baseUrl: string;
	organizationId: string;
	tenantId: string;
	database: string;
	prompt: string;
}) {
	const start = Date.now();

	const stages: EvalStages = {
		clickhouseOk: false,
		apiOk: false,
		seedOk: false,
		schemaSyncOk: false,
		sqlGenerated: false,
		queryExecuted: false,
		chartGenerated: false,
		sqlExpectationOk: false,
		outputExpectationOk: false,
		chartExpectationOk: false,
	};
	const expectationFailures: string[] = [];

	try {
		await client.ping();
		stages.clickhouseOk = true;
	} catch (error) {
		throw new Error(
			`ClickHouse ping failed (${DEFAULT_CLICKHOUSE_URL}). Is Docker running? ${getErrorMessage(error)}`,
		);
	}

	await verifyApiAccess(args.baseUrl);
	stages.apiOk = true;

	await seed();
	stages.seedOk = true;

	const qp = new QueryPanelSdkAPI(args.baseUrl, PRIVATE_KEY, args.organizationId);
	qp.attachClickhouse(args.database, createClickHouseClientFn(), {
		database: args.database,
		description: "ClickHouse demo database",
		tenantFieldName: EXPECTED.tenantFieldName,
	});

	console.log("\n📊 Running local query:");
	const localResult = await client.query({
		query: `SELECT SUM(amount) AS total_revenue FROM ${args.database}.orders WHERE ${EXPECTED.tenantFieldName} = {tenant_id:String}`,
		format: "JSONEachRow",
		query_params: {
			tenant_id: args.tenantId,
		},
	});
	const localRows = await localResult.json();
	console.table(localRows);

	try {
		console.log("\n🔄 Syncing schema with QueryPanel API...");
		await qp.syncSchema(args.database, {
			tenantId: args.tenantId,
		});
		stages.schemaSyncOk = true;
		console.log("✅ Schema synced successfully");
	} catch (error) {
		console.warn("\n⚠️  Schema sync failed. v2 retrieval may be weaker.");
		console.warn(getErrorMessage(error));
	}

	let sql = "";
	let rowCount = 0;
	let chartGenerated = false;
	try {
		console.log("\n🤖 Asking AI (v2 pipeline)...");
		const res: any = await qp.ask(args.prompt, {
			tenantId: args.tenantId,
			database: args.database,
			pipeline: "v2",
		});

		sql = typeof res.sql === "string" ? res.sql : "";
		stages.sqlGenerated = sql.trim().length > 0;
		console.log("\n📝 Generated SQL:");
		console.log(sql || "(missing)");
		if (Array.isArray(res.params)) {
			console.log("\n🧮 Parameters:");
			console.log(JSON.stringify(res.params, null, 2));
		}

		const rows =
			Array.isArray(res.rows) && res.rows.length > 0
				? res.rows
				: res.chart?.vegaLiteSpec?.data?.values;
		if (Array.isArray(rows)) {
			rowCount = rows.length;
			stages.queryExecuted = true;
			console.log("\n📊 Query Results (sample):");
			console.table(rows.slice(0, 10));
		}

		chartGenerated = Boolean(res.chart?.vegaLiteSpec || res.chart?.vizSpec);
		stages.chartGenerated = chartGenerated;
		if (res.chart?.vegaLiteSpec?.mark) {
			console.log("\n📈 Chart mark:", res.chart.vegaLiteSpec.mark);
		} else if (res.chart?.specType) {
			console.log("\n📈 Chart specType:", res.chart.specType);
		}
	} catch (error) {
		throw new Error(`AI query failed: ${getErrorMessage(error)}`);
	}

	// Expectations
	if (!stages.sqlGenerated) {
		expectationFailures.push("Expected generated SQL");
	} else {
		// ClickHouse prompt instructions should use single braces for params, e.g. {tenant_id:String}
		if (sql.includes("{{")) {
			expectationFailures.push("SQL contains '{{' (expected single-brace params for ClickHouse)");
		}
		if (!sql.toLowerCase().includes(EXPECTED.tenantFieldName)) {
			expectationFailures.push(
				`SQL does not reference tenant field '${EXPECTED.tenantFieldName}'`,
			);
		}
		if (!sql.toLowerCase().includes(EXPECTED.dateFieldName)) {
			expectationFailures.push(
				`SQL does not reference date field '${EXPECTED.dateFieldName}' (should use existing date column, not invent one)`,
			);
		}
		for (const forbidden of EXPECTED.forbiddenFieldNames) {
			if (sql.toLowerCase().includes(forbidden.toLowerCase())) {
				expectationFailures.push(
					`SQL references non-existent field '${forbidden}' (date-field hallucination)`,
				);
			}
		}
	}
	stages.sqlExpectationOk = expectationFailures.length === 0;

	if (!stages.queryExecuted || rowCount < EXPECTED.minRowCount) {
		expectationFailures.push(
			`Expected >= ${EXPECTED.minRowCount} row(s) but got ${rowCount}`,
		);
	}
	stages.outputExpectationOk = expectationFailures.length === 0;

	if (!chartGenerated) {
		expectationFailures.push("Expected a chart spec to be generated");
	}
	stages.chartExpectationOk = expectationFailures.length === 0;

	const durationMs = Date.now() - start;
	const success = expectationFailures.length === 0;
	return {
		durationMs,
		success,
		stages,
		expectationFailures,
	} as const;
}

async function main() {
	console.log("🚀 ClickHouse Demo for QueryPanel SDK (v2 pipeline)\n");
	console.log(`Config:`);
	console.log(`  QUERYPANEL_BASE_URL: ${DEFAULT_BASE_URL}`);
	console.log(`  CH_PROMPT: ${DEFAULT_PROMPT}`);
	console.log(`  CH_TENANT_ID: ${DEFAULT_TENANT_ID}`);
	console.log(`  CH_DATABASE: ${DEFAULT_DATABASE}`);
	console.log(`  CLICKHOUSE_URL: ${DEFAULT_CLICKHOUSE_URL}`);
	console.log(`  runs: ${EVAL_RUNS}`);
	console.log(`  delay_ms: ${EVAL_DELAY_MS}`);

	const summaries: RunSummary[] = [];

	for (let i = 1; i <= Math.max(EVAL_RUNS, 1); i += 1) {
		const start = Date.now();
		let runError: string | null = null;
		let runStages: EvalStages = {
			clickhouseOk: false,
			apiOk: false,
			seedOk: false,
			schemaSyncOk: false,
			sqlGenerated: false,
			queryExecuted: false,
			chartGenerated: false,
			sqlExpectationOk: false,
			outputExpectationOk: false,
			chartExpectationOk: false,
		};
		let expectationFailures: string[] = [];

		try {
			const result = await runOnce({
				baseUrl: DEFAULT_BASE_URL,
				organizationId: DEFAULT_ORGANIZATION_ID,
				tenantId: DEFAULT_TENANT_ID,
				database: DEFAULT_DATABASE,
				prompt: DEFAULT_PROMPT,
			});
			runStages = result.stages;
			expectationFailures = result.expectationFailures;
		} catch (error) {
			const message = getErrorMessage(error).trim();
			runError = message.length > 0 ? message : "Unknown error";
		}

		const durationMs = Date.now() - start;
		const success = !runError && expectationFailures.length === 0;
		const summary: RunSummary = {
			index: i,
			durationMs,
			success,
			errorMessage: runError,
			stages: runStages,
			expectationFailures,
		};
		summaries.push(summary);
		printRunSummary(summary);

		if (i < EVAL_RUNS && EVAL_DELAY_MS > 0) {
			await sleep(EVAL_DELAY_MS);
		}
	}

	printOverallSummary(summaries);

	await client.close();
	console.log("\n✅ Demo complete!");
}

main()
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
