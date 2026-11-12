import { runDedupedRequest } from "../../utils/requestDedup";

export interface BlockSqlPayload {
  /** Only for blocks without a stored id (the admin preview of an unsaved chart). */
  sql?: string;
  datasourceIds: string[];
  dashboardId?: string;
  /** Server-stored query (tenant-scoped) behind the block; the API runs it instead of `sql`. */
  query_id?: string;
  /** Dashboard chart row; the embed API runs its stored SQL with the tenant from the token. */
  chart_id?: string;
  /** Only with `sql`: a stored chart or query runs with its stored params. */
  params?: Record<string, unknown>;
  tenantFieldName?: string;
  previewTenantId?: string;
}

/**
 * Run-sql request body; empty/blank optional fields are omitted. A block with a stored id
 * (`chart_id`, else `query_id`) sends the id and no SQL or params: the server runs the stored
 * query. Only a block without one (the admin editor's unsaved chart) sends its SQL.
 */
export function buildBlockSqlPayload({
  sql,
  datasourceIds,
  dashboardId,
  queryId,
  savedChartId,
  sqlParams,
  tenantFieldName,
  previewTenantId,
}: {
  sql: string;
  datasourceIds: string[];
  dashboardId?: string;
  queryId?: string;
  savedChartId?: string;
  sqlParams: Record<string, unknown>;
  tenantFieldName?: string;
  previewTenantId?: string;
}): BlockSqlPayload {
  const tenantField = tenantFieldName?.trim() || undefined;
  const previewTenant = previewTenantId?.trim() || undefined;
  const chartId = savedChartId?.trim();
  const storedQueryId = queryId?.trim();
  const stored = chartId ? { chart_id: chartId } : storedQueryId ? { query_id: storedQueryId } : null;
  return {
    ...(stored ?? { sql, params: sqlParams }),
    datasourceIds,
    ...(dashboardId ? { dashboardId } : {}),
    ...(tenantField ? { tenantFieldName: tenantField } : {}),
    ...(previewTenant ? { previewTenantId: previewTenant } : {}),
  };
}

export function resolveRunSqlUrl(runSqlUrl: string | undefined, apiBaseUrl: string): string {
  return runSqlUrl ?? `${apiBaseUrl.replace(/\/+$/, "")}/query/run-sql`;
}

function getHeadersSignature(headers: Record<string, string>) {
  return JSON.stringify(Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)));
}

/** Dedup/cache key of a block's run-sql request. */
export function blockSqlRequestKey({
  keyPrefix,
  url,
  payload,
  headers,
}: {
  keyPrefix: string;
  url: string;
  payload: BlockSqlPayload;
  headers: Record<string, string>;
}): string {
  return `${keyPrefix}:${url}:${JSON.stringify(payload)}:${getHeadersSignature(headers)}`;
}

/**
 * Runs a block's SQL through the deduped run-sql endpoint. `force` bypasses the 60 s cache.
 * Throws an Error with the server's message, or `errorMessage` when it sent none.
 */
export async function runBlockSql({
  url,
  headers,
  organizationId,
  payload,
  force,
  keyPrefix,
  errorMessage,
}: {
  url: string;
  headers: Record<string, string>;
  organizationId?: string;
  payload: BlockSqlPayload;
  force: boolean;
  keyPrefix: string;
  errorMessage: string;
}): Promise<{ rows: Array<Record<string, unknown>>; fields: string[] }> {
  const requestKey = blockSqlRequestKey({ keyPrefix, url, payload, headers });
  const result = await runDedupedRequest(
    requestKey,
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(organizationId ? { "x-organization-id": organizationId } : {}),
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      const parsed = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parsed?.error || errorMessage);
      }
      return parsed;
    },
    { cacheMs: 60_000, bypassCache: force }
  );

  return {
    rows: Array.isArray(result?.rows) ? result.rows : [],
    fields: Array.isArray(result?.fields) ? result.fields : [],
  };
}
