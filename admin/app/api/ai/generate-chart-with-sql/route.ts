import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import type { BigQueryOptions } from '@google-cloud/bigquery';
import { QueryPanelSdkAPI } from '@querypanel/node-sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import {
  getVaultSecret,
  resolveDatasourcePassword,
  resolveBigQueryDatasourceConfig,
  type DatasourceRow,
} from '@/lib/services/datasource.service';
import { isGoogleInvalidRaptError } from '@/lib/oauth/google-bigquery';
import { Client } from 'pg';

export const runtime = 'nodejs';

function normalizePreviewRows(rows: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(rows)) {
    return rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
  }

  if (
    rows &&
    typeof rows === 'object' &&
    'values' in rows &&
    Array.isArray((rows as { values?: unknown }).values)
  ) {
    return (rows as { values: unknown[] }).values.filter(
      (row): row is Record<string, unknown> => typeof row === 'object' && row !== null
    );
  }

  return [];
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

function qualifyBigQueryDatasetTables(
  sql: string,
  opts: { dataset: string; datasetProjectId?: string }
) {
  const dataset = opts.dataset?.trim();
  const datasetProjectId = opts.datasetProjectId?.trim();
  if (!dataset || !datasetProjectId) return sql;

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    const {
      prompt,
      datasourceIds,
      conversationHistory,
      tenantFieldName,
      previewTenantId,
      querypanelSessionId,
      model,
    } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!datasourceIds || !Array.isArray(datasourceIds) || datasourceIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one datasource is required' },
        { status: 400 }
      );
    }

    // Get datasources from database
    const admin = createAdminClient();
    const { data: datasources, error: dsError } = await admin
      .from('datasources')
      .select('*')
      .eq('organization_id', orgId)
      .in('id', datasourceIds);

    if (dsError || !datasources || datasources.length === 0) {
      console.error('Failed to fetch datasources:', dsError);
      return NextResponse.json(
        { error: 'Failed to load datasources' },
        { status: 500 }
      );
    }

    // Get organization's private key from database (stored in Vault)
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
          hint: 'Go to Keys and generate a new key pair to enable chart generation.'
        },
        { status: 400 }
      );
    }

    // Retrieve private key from Vault
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

    // Initialize QueryPanel SDK with organization's key
    const qpApiUrl = process.env.QUERYPANEL_SDK_API_URL ||
      process.env.NEXT_PUBLIC_QUERYPANEL_SDK_URL ||
      process.env.SQL_AGENT_URL ||
      'http://localhost:3001';

    const qp = new QueryPanelSdkAPI(qpApiUrl, privateKey, orgId);

    // Attach datasources to SDK
    for (const ds of datasources as DatasourceRow[]) {     
      try {
        if (ds.dialect === 'postgres') {
          const password = await resolveDatasourcePassword(ds);
          if (!ds.host || !ds.port || !ds.username) {
            throw new Error(`Datasource ${ds.name} is missing host, port, or username`);
          }
          const host = ds.host;
          const port = ds.port;
          const username = ds.username;
          // Create a PostgresClientFn that matches the SDK's expected signature
          const createPostgresClientFn = () => {
            return async (sql: string, params?: unknown[]) => {
              const client = new Client({
                host,
                port,
                database: ds.database_name,
                user: username,
                password,
                ssl: ds.ssl_mode === 'disable' ? false : { rejectUnauthorized: false },
              });
              
              try {
                await client.connect();
                const result = await client.query(sql, params);
                return {
                  rows: result.rows as Array<Record<string, unknown>>,
                  fields: result.fields.map((f: { name: string }) => ({ name: f.name })),
                };
              } finally {
                await client.end().catch(() => undefined);
              }
            };
          };
          
          qp.attachPostgres(
            ds.database_name,
            createPostgresClientFn(),
            {
              database: ds.database_name,
              description: `Datasource: ${ds.name}`,
              tenantFieldName: tenantFieldName || ds.tenant_field_name || undefined,
              tenantFieldType: ds.tenant_field_type || 'String',
              enforceTenantIsolation: Boolean(previewTenantId),
            }
          );
        } else if (ds.dialect === 'bigquery') {
          const bigQueryConfig = await resolveBigQueryDatasourceConfig(ds);

          (qp as QueryPanelSdkAPIWithBigQuery).attachBigQuery(
            ds.database_name,
            createBigQueryClientFn(bigQueryConfig),
            {
              projectId: bigQueryConfig.projectId,
              datasetProjectId: bigQueryConfig.datasetProjectId,
              dataset: bigQueryConfig.dataset,
              location: bigQueryConfig.location,
              database: ds.database_name,
              description: `Datasource: ${ds.name}`,
              tenantFieldName: tenantFieldName || ds.tenant_field_name || undefined,
              tenantFieldType: ds.tenant_field_type || 'String',
              enforceTenantIsolation: Boolean(previewTenantId),
            }
          );
        }
        // else if (ds.dialect === 'clickhouse') {
        //   // Create a ClickHouseClientFn that matches the SDK's expected signature
        //   const createClickHouseClientFn = () => {
        //     return async (params: { query: string; query_params?: unknown }) => {
        //       const protocol = ds.ssl_mode === 'disable' ? 'http' : 'https';
        //       const client = createClickHouseClient({
        //         host: `${protocol}://${ds.host}:${ds.port}`,
        //         username: ds.username,
        //         password,
        //         database: ds.database_name,
        //       });
              
        //       const resultSet = await client.query({
        //         query: params.query,
        //         query_params: params.query_params,
        //         format: 'JSONEachRow',
        //       });
              
        //       const rows = await resultSet.json() as Array<Record<string, unknown>>;
        //       return { rows };
        //     };
        //   };
          
        //   qp.attachClickhouse(
        //     ds.name,
        //     createClickHouseClientFn(),
        //     {
        //       database: ds.database_name,
        //       description: `Datasource: ${ds.name}`,
        //     }
        //   );
        // }
      } catch (err) {
        console.error(`Failed to attach datasource ${ds.name}:`, err);
      }
    }

    // Build context from conversation history (for future AI integration)
    void conversationHistory; // Reserved for future use

    // Use the first datasource as default
    const primaryDatasource = datasources[0] as DatasourceRow;

    try {
      const resolvedTenantId = typeof previewTenantId === 'string' && previewTenantId.trim().length > 0
        ? previewTenantId.trim()
        : undefined;
      
      // Use node-sdk to generate SQL and execute query (pipeline v2 only)
      const result = await qp.ask(
        prompt,
        {
          tenantId: resolvedTenantId,
          database: primaryDatasource.database_name,
          pipeline: "v2",
          ...(typeof querypanelSessionId === "string" && querypanelSessionId
            ? { querypanelSessionId }
            : {}),
          ...(typeof model === "string" && model.trim().length > 0
            ? { model: model.trim() }
            : {}),
        }
      );

      // Get VizSpec from result (no data)
      const vizSpec = result.chart?.vizSpec;
      const vizSpecEncoding = vizSpec && vizSpec.kind === 'chart'
        ? vizSpec.encoding
        : null;
      
      // Build VizSpec-compatible response WITH data for preview
      // Data will be stripped when deploying to customers
      const previewRows = normalizePreviewRows(result.rows);
      const chartSpec = vizSpecEncoding ? {
        kind: 'chart',
        title: prompt,
        description: prompt,
        data: previewRows,
        encoding: {
          chartType: vizSpecEncoding.chartType || 'bar',
          x: vizSpecEncoding.x,
          y: vizSpecEncoding.y,
          series: vizSpecEncoding.series,
          stacking: vizSpecEncoding.stacking,
          sort: vizSpecEncoding.sort,
          limit: vizSpecEncoding.limit,
          tooltips: vizSpecEncoding.tooltips,
        }
      } : {
        // Fallback if no vizSpec returned
        kind: 'chart',
        title: prompt,
        description: prompt,
        data: previewRows,
        encoding: {
          chartType: 'bar',
          x: { field: result.fields?.[0] || 'x', type: 'nominal' as const },
          y: { field: result.fields?.[1] || 'y', type: 'quantitative' as const },
        }
      };

      // Generate rationale from result
      const chartType = vizSpecEncoding?.chartType || 'bar';
      const rationale = (result.chart as { rationale?: string })?.rationale || 
        result.rationale ||
        `This ${chartType} chart visualizes ${prompt.toLowerCase()}. The data was generated by executing SQL against your ${primaryDatasource.dialect} database (${primaryDatasource.name}).`;

      const resolvedParams = Object.keys(result.params || {}).length > 0
        ? result.params
        : (
            primaryDatasource.dialect === 'bigquery' &&
            resolvedTenantId &&
            (tenantFieldName || primaryDatasource.tenant_field_name)
          )
            ? { [tenantFieldName || primaryDatasource.tenant_field_name || 'tenant_id']: resolvedTenantId }
            : (
                primaryDatasource.dialect === 'postgres' &&
                /\$1\b/.test(result.sql) &&
                resolvedTenantId
              )
                ? { "1": resolvedTenantId }
                : {};

      // Normalize BigQuery SQL so saved charts don't depend on default dataset resolution.
      let normalizedSql = result.sql;
      if (primaryDatasource.dialect === "bigquery") {
        const bigQueryConfig = await resolveBigQueryDatasourceConfig(primaryDatasource as DatasourceRow);
        normalizedSql = ensureBigQueryTableAliases(
          qualifyBigQueryDatasetTables(normalizedSql, {
            dataset: bigQueryConfig.dataset,
            datasetProjectId: bigQueryConfig.datasetProjectId,
          })
        );
      }

      return NextResponse.json({
        message: `I've created a ${chartType} chart from your ${primaryDatasource.name} database.`,
        chartSpec,
        rationale,
        sql: normalizedSql,
        params: resolvedParams,
        tenantId: resolvedTenantId,
        rowCount: previewRows.length,
        sessionId: result.querypanelSessionId,
      });

    } catch (queryError) {
      if (isGoogleInvalidRaptError(queryError)) {
        console.error('BIGQUERY_GOOGLE_OAUTH_INVALID_RAPT', {
          route: 'POST /api/ai/generate-chart-with-sql',
          datasourceId: primaryDatasource.id,
          datasourceName: primaryDatasource.name,
        });
        return NextResponse.json({
          error: 'Google requires re-authentication for this BigQuery OAuth connection.',
          hint: 'Reconnect Google OAuth for this datasource or switch to service account auth.',
          code: 'BIGQUERY_GOOGLE_OAUTH_REAUTH_REQUIRED',
        }, { status: 400 });
      }
      console.error('Query execution failed:', queryError);
      
      // If real query fails, return helpful error
      return NextResponse.json({
        error: 'Failed to execute query',
        details: queryError instanceof Error ? queryError.message : 'Unknown error',
        hint: 'Try rephrasing your question or check datasource connection',
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error generating chart with SQL:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate chart',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
