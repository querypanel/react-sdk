import { type NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { createClient as createClickHouseClient } from "@clickhouse/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveDatasourcePassword,
  type DatasourceRow,
} from "@/lib/services/datasource.service";
import {
  getHttpStatus,
  getEmbeddedOrganizationId,
  resolveDemoEmbedContext,
} from "@/lib/demo/embedded-backend";

export const runtime = "nodejs";

interface RunSqlBody {
  sql?: string;
  params?: Record<string, string | number | boolean | string[] | number[]>;
  datasourceIds?: string[];
  database?: string;
  previewTenantId?: string;
}

function convertNamedToPositionalParams(
  params: Record<string, unknown>,
): unknown[] {
  const numericKeys = Object.keys(params)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => Number.parseInt(key, 10))
    .sort((a, b) => a - b);

  const namedKeys = Object.keys(params)
    .filter((key) => !/^\d+$/.test(key))
    .sort();

  const positional: unknown[] = [];

  for (const key of numericKeys) {
    let value = params[String(key)];
    if (typeof value === "string") {
      const match = value.match(/^<([a-zA-Z0-9_]+)>$/);
      const namedKey = match?.[1];
      if (namedKey && namedKey in params) {
        value = params[namedKey];
      }
    }
    positional.push(value);
  }

  for (const key of namedKeys) {
    positional.push(params[key]);
  }

  return positional;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await resolveDemoEmbedContext(request);
    const organizationId = getEmbeddedOrganizationId();
    if (!organizationId) {
      throw new Error("Missing organization context for customer SQL execution.");
    }

    const body = (await request.json().catch(() => ({}))) as RunSqlBody;
    const sql = typeof body.sql === "string" ? body.sql.trim() : "";
    if (!sql) {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }
    if (!Array.isArray(body.datasourceIds) || body.datasourceIds.length === 0) {
      return NextResponse.json(
        { error: "datasourceIds is required" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: datasources, error: datasourceError } = await admin
      .from("datasources")
      .select("*")
      .eq("organization_id", organizationId)
      .in("id", body.datasourceIds);

    if (datasourceError || !datasources || datasources.length === 0) {
      console.error("Failed to fetch datasources for customer SQL:", datasourceError);
      return NextResponse.json(
        { error: "Failed to load datasource" },
        { status: 500 },
      );
    }

    const datasource = datasources[0] as DatasourceRow;
    const password = await resolveDatasourcePassword(datasource);

    if (datasource.dialect === "postgres") {
      if (!datasource.host || !datasource.port || !datasource.username) {
        return NextResponse.json(
          { error: `Datasource ${datasource.name} is missing host, port, or username` },
          { status: 400 },
        );
      }
      const client = new Client({
        host: datasource.host,
        port: datasource.port,
        database: datasource.database_name,
        user: datasource.username,
        password,
        ssl: datasource.ssl_mode === "disable" ? false : { rejectUnauthorized: false },
      });

      try {
        await client.connect();
        let positionalParams = body.params
          ? convertNamedToPositionalParams(body.params)
          : undefined;
        const effectiveTenantId = body.previewTenantId?.trim() || context.tenantId;

        if (
          effectiveTenantId &&
          (!positionalParams || positionalParams.length === 0) &&
          /\$1\b/.test(sql)
        ) {
          positionalParams = [effectiveTenantId];
        }

        const result = await client.query(sql, positionalParams);
        return NextResponse.json({
          rows: result.rows ?? [],
          fields: result.fields?.map((field) => field.name) ?? [],
        });
      } finally {
        await client.end().catch(() => undefined);
      }
    }

    if (!datasource.host || !datasource.port || !datasource.username) {
      return NextResponse.json(
        { error: `Datasource ${datasource.name} is missing host, port, or username` },
        { status: 400 },
      );
    }
    const protocol = datasource.ssl_mode === "disable" ? "http" : "https";
    const clickhouseClient = createClickHouseClient({
      host: `${protocol}://${datasource.host}:${datasource.port}`,
      username: datasource.username,
      password,
      database: datasource.database_name,
    });

    const resultSet = await clickhouseClient.query({
      query: sql,
      query_params: body.params,
      format: "JSONEachRow",
    });
    const rows = (await resultSet.json()) as Array<Record<string, unknown>>;

    return NextResponse.json({
      rows,
      fields: rows.length > 0 ? Object.keys(rows[0]) : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: getHttpStatus(error) });
  }
}
