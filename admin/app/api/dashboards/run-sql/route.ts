import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { QueryPanelSdkAPI } from '@querypanel/node-sdk';
import { Client } from 'pg';
import { createClient as createClickHouseClient } from '@clickhouse/client';
import { BigQuery } from '@google-cloud/bigquery';
import type { BigQueryOptions } from '@google-cloud/bigquery';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import {
  resolveDatasourcePassword,
  resolveBigQueryDatasourceConfig,
  getVaultSecret,
  type DatasourceRow,
} from '@/lib/services/datasource.service';
import { isGoogleInvalidRaptError } from '@/lib/oauth/google-bigquery';

export const runtime = 'nodejs';

function qualifyBigQueryDatasetTables(
  sql: string,
  opts: { dataset: string; datasetProjectId?: string }
) {
  const dataset = opts.dataset?.trim();
  const datasetProjectId = opts.datasetProjectId?.trim();
  if (!dataset || !datasetProjectId) return sql;

  // Rewrite `dataset.table` -> `project.dataset.table` inside backticks only.
  // This avoids relying on default dataset/project resolution, which can vary
  // by credentials and is a common source of "dataset not found" errors.
  //
  // Examples:
  // - `samples.github_timeline` -> `bigquery-public-data.samples.github_timeline`
  // - `project.samples.github_timeline` stays unchanged (doesn't match).
  const pattern = new RegExp(
    `\\\`${dataset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.([A-Za-z0-9_]+)\\\``,
    "g"
  );
  return sql.replace(pattern, (_match, table: string) => `\`${datasetProjectId}.${dataset}.${table}\``);
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureBigQueryTableAliases(sql: string) {
  const clausePattern =
    /\b(FROM|JOIN)\s+`([^`]+)`(?=\s+(?:WHERE|GROUP|ORDER|LIMIT|JOIN|LEFT|RIGHT|FULL|INNER|CROSS|ON|USING|HAVING|UNION|QUALIFY)\b|\s*$)/gi;

  return sql.replace(clausePattern, (match, clause: string, identifier: string) => {
    const tableName = identifier.split(".").pop()?.trim();
    if (!tableName) return match;

    const qualifiedColumnPattern = new RegExp(`\\b${escapeRegex(tableName)}\\.`, "i");
    if (!qualifiedColumnPattern.test(sql)) return match;

    return `${clause} \`${identifier}\` AS ${tableName}`;
  });
}

type QueryPanelSdkAPIWithBigQuery = QueryPanelSdkAPI & {
  attachBigQuery: (
    databaseName: string,
    clientFn: ReturnType<typeof createBigQueryClientFn>,
    options: {
      projectId: string;
      datasetProjectId: string;
      dataset: string;
      location?: string;
      database: string;
      description: string;
      tenantFieldName?: string;
      tenantFieldType?: string;
      enforceTenantIsolation?: boolean;
    },
  ) => void;
};

type RunSqlRequest = {
  sql: string;
  datasourceIds: string[];
  dashboardId?: string;
  params?: unknown[] | Record<string, unknown> | null;
  tenantFieldName?: string;
  previewTenantId?: string;
};

/** Normalize request params to Record for node-sdk (runSqlForDashboard expects Record<string, unknown>). */
function normalizeParams(
  params: unknown[] | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (params == null) return {};
  if (Array.isArray(params)) {
    const out: Record<string, unknown> = {};
    params.forEach((v, i) => {
      out[String(i + 1)] = v;
    });
    return out;
  }
  if (typeof params === 'object' && params !== null) {
    return params as Record<string, unknown>;
  }
  return {};
}

function createBigQueryClientFn(config: {
  projectId: string;
  datasetProjectId: string;
  dataset: string;
  location?: string;
  credentials?: BigQueryOptions['credentials'];
  oauth?: {
    refreshToken: string;
  };
}) {
  let bigqueryPromise: Promise<BigQuery> | null = null;
  const getBigQuery = async () => {
    if (bigqueryPromise) return bigqueryPromise;
    bigqueryPromise = (async () => {
      if (config.oauth?.refreshToken) {
        const { OAuth2Client } = await import('google-auth-library');
        const oauthClient = new OAuth2Client(
          process.env.GOOGLE_OAUTH_CLIENT_ID,
          process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          process.env.GOOGLE_OAUTH_REDIRECT_URI
        );
        oauthClient.setCredentials({
          refresh_token: config.oauth.refreshToken,
        });
        return new BigQuery({
          projectId: config.projectId,
          authClient: oauthClient,
        });
      }

      return new BigQuery({
        projectId: config.projectId,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    })();
    return bigqueryPromise;
  };

  return async (request: {
    query: string;
    params?: Record<string, string | number | boolean | string[] | number[]>;
    dryRun?: boolean;
  }) => {
    const bigquery = await getBigQuery();
    const options: Parameters<typeof bigquery.createQueryJob>[0] = {
      query: request.query,
      defaultDataset: {
        projectId: config.datasetProjectId,
        datasetId: config.dataset,
      },
      ...(config.location ? { location: config.location } : {}),
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
    const fields = rows.length > 0
      ? Object.keys(rows[0] as Record<string, unknown>)
      : [];
    const normalizedRows = rows.map((row) => {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          record[key] = (value as { value: unknown }).value;
        } else {
          record[key] = value;
        }
      }
      return record;
    });

    return { rows: normalizedRows, fields };
  };
}

/**
 * Run SQL via node-sdk: same execution path as embed (params conversion,
 * adapters, tenant handling). Reuses SDK instead of duplicating logic here.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    const body = (await request.json()) as RunSqlRequest;
    let sql = body?.sql;
    const datasourceIds = body?.datasourceIds;
    const dashboardId = typeof body?.dashboardId === 'string' ? body.dashboardId.trim() : '';
    const previewTenantId = typeof body?.previewTenantId === 'string' ? body.previewTenantId.trim() : '';
    const tenantFieldName = typeof body?.tenantFieldName === 'string' ? body.tenantFieldName.trim() || undefined : undefined;

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL is required' }, { status: 400 });
    }
    if (!Array.isArray(datasourceIds) || datasourceIds.length === 0) {
      return NextResponse.json({ error: 'Datasource is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    let { data: datasources, error: dsError } = await admin
      .from('datasources')
      .select('*')
      .eq('organization_id', orgId)
      .in('id', datasourceIds);

    if ((!datasources || datasources.length === 0) && !dsError && dashboardId) {
      const { data: dashboard, error: dashboardError } = await admin
        .from('dashboards')
        .select('datasource_id, available_datasource_ids')
        .eq('id', dashboardId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!dashboardError && dashboard) {
        const fallbackIds = Array.isArray(dashboard.available_datasource_ids) && dashboard.available_datasource_ids.length > 0
          ? dashboard.available_datasource_ids
          : (typeof dashboard.datasource_id === 'string' && dashboard.datasource_id
              ? [dashboard.datasource_id]
              : []);

        if (fallbackIds.length > 0) {
          const fallbackResult = await admin
            .from('datasources')
            .select('*')
            .eq('organization_id', orgId)
            .in('id', fallbackIds);

          datasources = fallbackResult.data;
          dsError = fallbackResult.error;
        }
      }
    }

    if (dsError) {
      console.error('Failed to fetch datasources:', dsError);
      return NextResponse.json({ error: 'Failed to load datasource' }, { status: 500 });
    }

    if (!datasources || datasources.length === 0) {
      console.error('No datasource resolved for run-sql request', {
        orgId,
        dashboardId: dashboardId || null,
        requestedDatasourceIds: datasourceIds,
      });
      return NextResponse.json(
        { error: 'Failed to load datasource', hint: 'The chart references a datasource that is no longer available for this dashboard.' },
        { status: 404 }
      );
    }

    const datasource = datasources[0] as DatasourceRow;
    const password = await resolveDatasourcePassword(datasource);

    // Get organization's private key (same as generate-chart-with-sql)
    const { data: orgKeys, error: keysError } = await admin
      .from('public_keys')
      .select('private_key_secret_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .not('private_key_secret_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (keysError || !orgKeys || orgKeys.length === 0) {
      console.error('No active private key found for organization:', keysError);
      return NextResponse.json(
        {
          error: 'No SDK key configured. Please generate a key pair on the Keys page.',
          hint: 'Go to Keys and generate a new key pair to enable running SQL.',
        },
        { status: 400 }
      );
    }

    let privateKey: string;
    try {
      const privateKeySecretId = orgKeys[0]?.private_key_secret_id;
      if (!privateKeySecretId) {
        throw new Error('Private key not found in vault');
      }
      privateKey = await getVaultSecret(privateKeySecretId);
      if (!privateKey) {
        throw new Error('Private key not found in vault');
      }
    } catch (vaultError) {
      console.error('Failed to retrieve private key from vault:', vaultError);
      return NextResponse.json(
        { error: 'Failed to retrieve organization private key from vault' },
        { status: 500 }
      );
    }

    const qpApiUrl = process.env.QUERYPANEL_SDK_API_URL ||
      process.env.NEXT_PUBLIC_QUERYPANEL_SDK_URL ||
      process.env.SQL_AGENT_URL ||
      'http://localhost:3001';

    // Use node-sdk for execution (params, adapters, tenant handling — same as embed)
    const qp = new QueryPanelSdkAPI(qpApiUrl, privateKey, orgId);

    if (datasource.dialect === 'postgres') {
      if (!datasource.host || !datasource.port || !datasource.username) {
        return NextResponse.json(
          { error: `Datasource ${datasource.name} is missing host, port, or username` },
          { status: 400 }
        );
      }
      const host = datasource.host;
      const port = datasource.port;
      const username = datasource.username;
      const createPostgresClientFn = () => {
        return async (querySql: string, params?: unknown[]) => {
          const client = new Client({
            host,
            port,
            database: datasource.database_name,
            user: username,
            password,
            ssl: datasource.ssl_mode === 'disable' ? false : { rejectUnauthorized: false },
          });
          try {
            await client.connect();
            const result = await client.query(querySql, params);
            return {
              rows: result.rows as Array<Record<string, unknown>>,
              fields: result.fields.map((f: { name: string }) => ({ name: f.name })),
            };
          } finally {
            await client.end().catch(() => undefined);
          }
        };
      };

      const effectiveTenantField = tenantFieldName ?? datasource.tenant_field_name ?? undefined;
      const enforceTenant = Boolean(previewTenantId);

      qp.attachPostgres(datasource.database_name, createPostgresClientFn(), {
        database: datasource.database_name,
        description: `Datasource: ${datasource.name}`,
        tenantFieldName: effectiveTenantField || undefined,
        tenantFieldType: (datasource.tenant_field_type as 'String' | 'Number' | 'UUID') || 'String',
        enforceTenantIsolation: enforceTenant,
      });
    } else if (datasource.dialect === 'clickhouse') {
      if (!datasource.host || !datasource.port || !datasource.username) {
        return NextResponse.json(
          { error: `Datasource ${datasource.name} is missing host, port, or username` },
          { status: 400 }
        );
      }
      const protocol = datasource.ssl_mode === 'disable' ? 'http' : 'https';
      const clickhouseClient = createClickHouseClient({
        host: `${protocol}://${datasource.host}:${datasource.port}`,
        username: datasource.username,
        password,
        database: datasource.database_name,
      });

      const clientFn = async (params: { query: string; query_params?: Record<string, unknown>; format?: string }) => {
        const resultSet = await clickhouseClient.query({
          query: params.query,
          query_params: params.query_params,
          format: (params.format as 'JSONEachRow') || 'JSONEachRow',
        });
        return resultSet;
      };

      const effectiveTenantField = tenantFieldName ?? datasource.tenant_field_name ?? undefined;
      const enforceTenant = Boolean(previewTenantId);

      qp.attachClickhouse(datasource.database_name, clientFn, {
        database: datasource.database_name,
        description: `Datasource: ${datasource.name}`,
        tenantFieldName: effectiveTenantField || undefined,
        tenantFieldType: (datasource.tenant_field_type as string) || 'String',
        enforceTenantIsolation: enforceTenant,
      });
    } else if (datasource.dialect === 'bigquery') {
      const bigQueryConfig = await resolveBigQueryDatasourceConfig(datasource);
      const effectiveTenantField = tenantFieldName ?? datasource.tenant_field_name ?? undefined;
      const enforceTenant = Boolean(previewTenantId);

      (qp as QueryPanelSdkAPIWithBigQuery).attachBigQuery(datasource.database_name, createBigQueryClientFn(bigQueryConfig), {
        projectId: bigQueryConfig.projectId,
        datasetProjectId: bigQueryConfig.datasetProjectId,
        dataset: bigQueryConfig.dataset,
        location: bigQueryConfig.location,
        database: datasource.database_name,
        description: `Datasource: ${datasource.name}`,
        tenantFieldName: effectiveTenantField || undefined,
        tenantFieldType: (datasource.tenant_field_type as string) || 'String',
        enforceTenantIsolation: enforceTenant,
      });

      sql = ensureBigQueryTableAliases(
        qualifyBigQueryDatasetTables(sql, {
          dataset: bigQueryConfig.dataset,
          datasetProjectId: bigQueryConfig.datasetProjectId,
        })
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported dialect: ${datasource.dialect}` },
        { status: 400 }
      );
    }

    let paramsRecord = normalizeParams(body?.params);
    const tenantId = previewTenantId || '__admin_preview__';

    if (
      previewTenantId &&
      Object.keys(paramsRecord).length === 0 &&
      datasource.dialect === 'postgres' &&
      /\$1\b/.test(sql)
    ) {
      paramsRecord = { '1': previewTenantId };
    }

    const result = await qp.runSqlForDashboard(
      {
        sql,
        params: Object.keys(paramsRecord).length > 0 ? paramsRecord : undefined,
        database: datasource.database_name,
      },
      { tenantId }
    );

    return NextResponse.json({
      rows: result.rows ?? [],
      fields: result.fields ?? [],
      datasource: {
        id: datasource.id,
        name: datasource.name,
        database: datasource.database_name,
        dialect: datasource.dialect,
      },
    });
  } catch (error) {
    if (isGoogleInvalidRaptError(error)) {
      console.error('BIGQUERY_GOOGLE_OAUTH_INVALID_RAPT', {
        route: 'POST /api/dashboards/run-sql',
      });
      return NextResponse.json(
        {
          error: 'Google requires re-authentication for this BigQuery OAuth connection.',
          hint: 'Reconnect Google OAuth for this datasource or switch to service account auth.',
          code: 'BIGQUERY_GOOGLE_OAUTH_REAUTH_REQUIRED',
        },
        { status: 400 }
      );
    }
    console.error('Error running SQL for dashboard:', error);
    const message = error instanceof Error ? error.message : 'Failed to run query';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
