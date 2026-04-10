/**
 * BigQuery demo for QueryPanel SDK.
 *
 * Prerequisites:
 * - GCP project with BigQuery API enabled and Application Default Credentials:
 *   gcloud auth application-default login
 * - Set GOOGLE_CLOUD_PROJECT (or the client will use default project from ADC).
 *
 * Optional env:
 * - BQ_PROJECT_ID: project that owns the dataset to introspect (default: same as GOOGLE_CLOUD_PROJECT).
 * - BQ_DATASET: dataset name (default: usa_names for public demo).
 * - BQ_LOCATION: dataset location, e.g. "US" (default: "US").
 *
 * This script uses the public dataset bigquery-public-data.usa_names when BQ_PROJECT_ID/BQ_DATASET
 * are not set, so you can run introspect and ask without creating any tables.
 */

import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import type {
	BigQueryClientFn,
	BigQueryQueryResult,
} from "@querypanel/node-sdk";
import {
	type AskResponse,
	QueryPanelSdkAPI,
} from "@querypanel/node-sdk";

const projectId =
	process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const bqProjectId = process.env.BQ_PROJECT_ID ?? projectId;
const bqDatasetProjectId = process.env.BQ_DATASET_PROJECT_ID ?? bqProjectId;
const datasetId = process.env.BQ_DATASET ?? "usa_names";
const location = process.env.BQ_LOCATION ?? "US";

const bigquery = new BigQuery(
	projectId ? { projectId } : undefined,
);

/**
 * Implements BigQueryClientFn using @google-cloud/bigquery.
 * - dryRun: true → createQueryJob with dryRun to validate without executing.
 * - dryRun: false → createQueryJob then getQueryResults, return rows and field names.
 */
const createBigQueryClientFn = (): BigQueryClientFn => {
	return async (
		request: Parameters<BigQueryClientFn>[0],
	): Promise<BigQueryQueryResult> => {
		const options: Parameters<typeof bigquery.createQueryJob>[0] = {
			query: request.query,
			location,
			defaultDataset: {
				projectId: bqDatasetProjectId,
				datasetId,
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
		const fields =
			rows.length > 0
				? (Object.keys(rows[0] as Record<string, unknown>) as string[])
				: [];
		const rowsAsRecords = rows.map((row) => {
			const rec: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(row)) {
				rec[k] =
					typeof v === "object" && v !== null && "value" in v
						? (v as { value: unknown }).value
						: v;
			}
			return rec;
		});

		// BigQuery Row types may have { value } wrappers; flatten if present
		const normalized = rowsAsRecords.map((r) => {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(r)) {
				out[k] =
					typeof v === "object" && v !== null && "value" in v
						? (v as { value: unknown }).value
						: v;
			}
			return out;
		});

		return { rows: normalized, fields };
	};
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

async function main() {
	console.log("🚀 BigQuery Demo for QueryPanel SDK\n");

	if (!projectId) {
		console.error(
			"❌ Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT, or run with default ADC project.",
		);
		console.error("   Example: GOOGLE_CLOUD_PROJECT=my-project tsx scripts/bigquery-demo.ts\n");
		process.exitCode = 1;
		return;
	}

	console.log(`   Project: ${projectId}`);
	console.log(`   Query project: ${bqProjectId}`);
	console.log(`   Dataset: ${bqDatasetProjectId}.${datasetId}`);
	console.log(`   Location: ${location}\n`);

	// Quick validation: run a tiny dry run
	try {
		await bigquery.createQueryJob({
			query: `SELECT 1 AS n FROM \`${bqDatasetProjectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\` LIMIT 1`,
			defaultDataset: {
				projectId: bqDatasetProjectId,
				datasetId,
			},
			location,
			dryRun: true,
		});
		console.log("✅ BigQuery connection and permissions OK");
	} catch (error) {
		console.error("❌ BigQuery access failed:", getErrorMessage(error));
		console.error("   Ensure ADC is set (gcloud auth application-default login) and the dataset exists.\n");
		process.exitCode = 1;
		return;
	}

	const baseUrl = process.env.QUERYPANEL_BASE_URL ?? "http://localhost:3001";
	const privateKey =
    "-----BEGIN PRIVATE KEY-----\nMIIJQgIBADANBgkqhkiG9w0BAQEFAASCCSwwggkoAgEAAoICAQDILZo2yfSB82gx\ngHHy0oO/fhd/02iEl8MmHPeLjt0anAISdCdrYsRdS9fsNj8+Vbd4/kMYOexZEiyD\nsFvcNGE6s1Ii8+cJN/bKZ2/AZB4V5CU32wLYb8DEFnbqCRfQ4TVYtfWCdLnrOuH+\nhWt9PP8ypyqAFzrWZ9YlV61s08lqQTgtSQX+HYYGBxedvrCImxpvYvPZw9bkKskl\n0yINp/A16M01f03ee6Ow25izO1x4WIjVO6ZVsTBm4xyUFaFtS8KQE44gxGlG29bq\n71sPyIdYcTsNNUln61AX52ctc8bagQ0ZP96q/28Kjy7CcpIqY3HwAvdulTj/5j8z\n77SwmA/5qSQShzLWuYhgd7a14CHsiVFryJCB0tPBrj5KiB1PFRj5S6doYuo1eTFr\nzgv0XBGV7eNAcdBG2l2wbgYhVsVOKzUJ4auqQSXImablHcrx3is2UXC0ad9kq1JP\n9yhpN+9Vb4iiQeVme3VDRy16sv2eOEPZOG9oQtUlObsuOG346vDwFNn2sbvOv93a\nkVgWDP68GiYSe46ICAk7WfLBxB0/QWHviwFhxa3ipcOWrEWtw3f4QM68dtv/f4je\nDB6QVYTPkW3F7s5+hSEd0O1Ve8KC2HOjtbJqRjl4HoSQCGQyTLoGPCdCOY2PRXNY\nX/J7I9Vg5Ys74ZvKOB57NuzConuuLQIDAQABAoICADj/RxRHn7+qs2W46XkW+N17\nBSzn4LA0WCQPhmqt1IYBmtNvUFQSzM+1yzbeYVaZ6IJif28z+viHpLYgbp9+KJsi\nuQXrxcKJtVL/bcHtn+Vizzgeu6ot88jBjr1ntmjK3zoxoUSygMeaPgQPMEJ6Lj3Z\nfE/5jU7ERSTf2KkOiqCfDmRSkQrAlEs+FLrdM33KEBZcKgu86ACSsDB9dApIYayv\n61JKu7zYHo06kbmi8trvdpKkh+GJcLsy+o2ttQeeVTlZ4BOzaTh8Wy8M1TRiyCrm\nHsbNf+e/iFAuGuJFv36y1Sx106yDy7XJfCpwne7E3wnUhmhtw8uVXzSmEaBgw9c0\nawRZ/5zc7DylCpVRAI+VwAahdqE2HL7mhqnY3n8aGADRaBgZ9nZ4/WNlqY+DroY2\n3DxDUAArwaWM/Ruaojr/kl9YuOO8nm2+oikc0Z9z1ZjCDib6Kli0UR0DxSS7DZp+\nN2/QND1wxeuxtNwSrNHRNhi7ISEAbHgMKNr6YZR76cpy6NqoRqjj6s9l1rviV05J\nF9Y4LHIEcW/H2HMnmxzUo5yAz7SHSWVbUwo/0snc7GvVb6CMniE//Dyg2rsgMUPN\nbSvNjpPrxyyELelmYQ5UaJ/1kVhBhaDL0qC8p+9nGNsBP2avNq8CsequbL+W/H+7\nI6ACh204+jD3L01RHJAPAoIBAQD79DzATstS5ClNkFqiC3n3i1yGiLYcgiMbYalg\nyI5jq0nIfgtDgAumF764daykKwVcbNRVrub5rfHiIGIaQwBwbRVDhggsnDtvL3GQ\nV1YcBvXznOELdl2hAQs66HnJlwvwr5fak4KFwxQeE7s1d/bxJ5w7Wvmr+WEZXXbO\nwdTBH0ava/YdiagGvhHNXN97uODcUs7dxA9tGn7l6G6szC5cs0NQC3v3qKcVwiyi\nPFvFYBSZEt3l3BrdMPM2vZNpgFW0t/HZOOig8+3drpkgG5va+KRhSmhn4OLZmy+I\nJxVvhZdgBLJGORxx4DV2ILf3J8SEHxHyWS1V3ABl11ct3Oc7AoIBAQDLZIS7mAYL\nEuejw5b5HHSG5mWAXXzqMna8w9ym1f3BGcvWCcTrI2VPX8YiWlxcorvDdGPmBQ1g\nRGPujBtjoyiMJw/3BWh+0JGaYtJe1PJTHxQC8QaVaVMBije1/6fe+MarIFK9sV1W\nOTnRfdDrawu/Qsn1xsZazgNuHmp7NEunL0Rf/GxaJbE6LmIzncqzxem5HVWoDqMm\nFwu6/2zK4q2rIfa5fICGlKr00BSQ5FFtWxujBaD6sZoEE5NR5k7GvPP6Qs6GapdO\na6wnz0hzWhE0FPxusbiOl+CZkk2EXaAjle5owRIJobI1hXCZLJ11UW5fYyKA9jdU\n43GEXwjvXvm3AoIBAD6812/PbwOp+rrsqhTVpL5GPnjli+tXYGSOEf4eko4w9cNt\n12IsfToTiZMnAiEy8TfNhaX8Ullzvdpf0+3UJ0TXdMcGlfx9vrL17mJRzQhXl2Dc\n/JC9HZ1cxC4b+09+RCPfpYFw37xtEhJXOXOb9qqgAWAqTCdNhqcpRc9AJrkcD57Y\n1EUQpP1g0NABQ0jshVl3aTmBe5HgWh7nnL98bEL7BFTnNyw5G7noSvLu8q8YOKjR\nMN3uy+WuLbHAzPclVLIWZ6t+ZzbE5sMfmdOL7Gg/J7duLsdHEVW8Nb7CdKz7Z/Ep\n2jZwPCwC92z9wrFRfrajgfWFzSsnCBZT48pwykcCggEBAK0b4YjUrBgSwAp29vER\nEfCa+brWVvHxf3PL8+ofablHXmDOscY7uwdiiX1FkSTa8Jo7Xqcwl6DetHsczlbw\nUBtxR7pD5RtCIxrWjxxde93ZLqwOPj8+hIJkBGSnslYpQNX3TdTbt4gibp5pyj4E\nPtxLWR8RTlOM0giQZKp16QnjRfu4GPRk7kGJptUtsI9vnCyM1hGSW7OYm8hNi2fm\npE9qOdbHK5Dfyd1RmJ91ZASCLbSDnu6f6GkdzB5BubyWp8TRxXtMD3mUVNMRLiXX\ne5rrXapNIrpic6vhhI5rLVf8TQzlfpeqAsZgy2PjQCTQ6PLQqlY+uPtMFZrHVBB/\nsmMCggEAOUl/fgDKDZwWBAfqnbeq9X/z+aP+z95jRAFsGWTHMu3hk+5A+0cFnIFA\nTrC3NXLiK09kZFR+IB0Rzf7j8X4DucCAqO6sDniPLjghPaPLANuvMYszKEO37JfM\nJxxDxeMIwJmqGdl77YxPagee2xQGs9OtoF2ETOEZ0S9D6bpWieqJ8+LfOX2ILrij\nki8HF9YHzt47fkKyCu9MQJ7pcolXMuH05MJXN1T72IEBPzAMdq4UBiSEHr6d+dh0\nOfzkNbwJr/8BXH2j0DBYoTdmjjF8qoGwaHnG1Vc2l/DXUsYUCCi2elE2oQ/xOk0H\nbKAhGPeXR7C8RGog+i0BcqmVCrFJeg==\n-----END PRIVATE KEY-----\n";
	const organizationId = "e62f7e03-a96e-4dc8-8e3b-137163e20c97";

	const qp = new QueryPanelSdkAPI(
		baseUrl,
		privateKey ?? "",
		organizationId ?? "",
	);

	// Attach BigQuery using the SDK's BigQueryAdapter
	// Use repository_organization for SDK tenant isolation metadata/sync.
	qp.attachBigQuery("samples", createBigQueryClientFn(), {
		projectId: bqProjectId,
		datasetProjectId: bqDatasetProjectId,
		dataset: datasetId,
		location,
		database: "samples",
		description: "BigQuery demo for open github timeline stats",
		allowedTables: ["github_timeline"],
		tenantFieldName: "repository_organization",
	});

	// Introspect (list tables and columns)
	console.log("\n📋 Introspecting schema...");
	try {
		const introspection = await qp.introspect("samples");
		console.log(`   DB: ${introspection.db.kind} / ${introspection.db.name}`);
		console.log(`   Tables: ${introspection.tables.length}`);
		for (const t of introspection.tables.slice(0, 5)) {
			console.log(`   - ${t.schema}.${t.name} (${t.columns.length} columns)`);
		}
		if (introspection.tables.length > 5) {
			console.log(`   ... and ${introspection.tables.length - 5} more`);
		}
	} catch (error) {
		console.warn("⚠️  Introspect failed:", getErrorMessage(error));
	}

	// Sync schema with QueryPanel API (optional)
	if (privateKey && organizationId) {
		try {
			console.log("\n🔄 Syncing schema with QueryPanel API...");
			const syncResult = await qp.syncSchema(
				"samples", 
				{ tenantId: organizationId }
			);
			if (syncResult.skipped) {
				console.log("ℹ️  Schema unchanged; skipping ingestion");
			} else {
				console.log(
					`✅ Schema synced (${syncResult.chunks} chunks created)`,
				);
			}
		} catch {
			console.warn(
				"⚠️  Schema sync failed (server may not be running). Start with: bun run dev",
			);
		}

		// Ask the AI (requires running API and synced schema)
		try {
			console.log("\n🤖 Asking AI to generate SQL...");
			const res: AskResponse = await qp.ask(
				"Who is the top contributor in the organization?",
				{ 
					database: "samples",
					tenantId: 'github',
				},
			);
			console.log("\n📝 Generated SQL:");
			console.log(res.sql);
			if (res.params && Object.keys(res.params).length > 0) {
				console.log("\n🧮 Parameters:");
				console.log(JSON.stringify(res.params, null, 2));
			}
			if (res.rationale) {
				console.log("\n💭 Rationale:");
				console.log(res.rationale);
			}
			console.log("\n📊 Query Results:");
			console.table(res.rows?.slice(0, 10) ?? []);
			if (res.chart?.vegaLiteSpec) {
				console.log("\n📈 Chart spec generated");
			}
		} catch (error) {
			console.warn("\n⚠️  AI query failed:", getErrorMessage(error));
		}
	}

	console.log("\n✅ Demo complete!");
}

main().catch((err) => {
	console.error("\n❌ Error:", err.message);
	process.exitCode = 1;
});
