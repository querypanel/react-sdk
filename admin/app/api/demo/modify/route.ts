import { type NextRequest, NextResponse } from "next/server";
import {
  QueryPanelSdkAPI,
  type PostgresClientFn,
  type ChartModifyInput,
  type ChartModifyOptions,
  type ChartModifyResponse,
  type ParamRecord,
} from "@querypanel/node-sdk";
import { executeSql } from "@/lib/demo/postgres-client";

// Node.js runtime required for @querypanel/node-sdk (uses crypto and other Node built-ins)
export const runtime = "nodejs";

let sdk: QueryPanelSdkAPI | null = null;

function createPostgresClientFn(): PostgresClientFn {
  return async (sql: string, params?: unknown[]) => {
    return executeSql(sql, params);
  };
}

function getSdk(): QueryPanelSdkAPI {
  if (!sdk) {
    const baseUrl = process.env.SQL_AGENT_URL;
    if (!baseUrl) {
      throw new Error("SQL_AGENT_URL environment variable is not set");
    }
    const privateKeyRaw = process.env.DEMO_QP_PRIVATE_KEY;
    const organizationId = process.env.DEMO_QP_ORGANIZATION_ID;

    if (!privateKeyRaw) {
      throw new Error("DEMO_QP_PRIVATE_KEY environment variable is not set");
    }
    if (!organizationId) {
      throw new Error("DEMO_QP_ORGANIZATION_ID environment variable is not set");
    }

    // Convert escaped newlines to actual newlines (env vars store \n as literal)
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    sdk = new QueryPanelSdkAPI(baseUrl, privateKey, organizationId, {
      defaultTenantId: "csabai",
    });

    // Attach the postgres database - SQL execution uses shared executeSql function
    sdk.attachPostgres("netflix_demo", createPostgresClientFn(), {
      database: "postgres",
      description: "Netflix shows demo database",
      tenantFieldName: "tenant_id",
      enforceTenantIsolation: true,
      allowedTables: ["netflix_shows"],
    });
  }
  return sdk;
}

interface ModifyRequestBody {
  sql: string;
  question: string;
  params?: ParamRecord;
  sqlModifications?: ChartModifyInput["sqlModifications"];
  vizModifications?: ChartModifyInput["vizModifications"];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ModifyRequestBody;
    const { sql, question, params, sqlModifications, vizModifications } = body;

    if (!sql || typeof sql !== "string") {
      return NextResponse.json(
        { error: "SQL is required", success: false },
        { status: 400 },
      );
    }

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required", success: false },
        { status: 400 },
      );
    }

    const qpSdk = getSdk();

    // Ensure schema is synced (same as ask route; ignore non-fatal errors)
    try {
      await qpSdk.syncSchema("netflix_demo", { tenantId: "csabai" });
    } catch (syncError) {
      console.warn("Schema sync warning (modify):", syncError);
    }

    const input: ChartModifyInput = {
      sql,
      question,
      database: "netflix_demo",
      params,
      sqlModifications,
      vizModifications,
    };

    const options: ChartModifyOptions = {
      tenantId: "csabai",
      chartType: "vizspec", // Use native VizSpec rendering with Recharts
    };

    const response: ChartModifyResponse = await qpSdk.modifyChart(input, options);

    return NextResponse.json({
      success: true,
      sql: response.sql,
      params: response.params,
      rationale: response.rationale,
      rows: response.rows,
      fields: response.fields,
      chart: response.chart,
      modified: response.modified,
    });
  } catch (error) {
    console.error("Demo modify error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: errorMessage, success: false },
      { status: 500 },
    );
  }
}



