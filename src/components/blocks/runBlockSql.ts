import { runDedupedRequest } from "../../utils/requestDedup";

export interface BlockSqlPayload {
  sql: string;
  datasourceIds: string[];
  dashboardId?: string;
  params: Record<string, unknown>;
  tenantFieldName?: string;
  previewTenantId?: string;
}

/** Run-sql request body; empty/blank optional fields are omitted. */
export function buildBlockSqlPayload({
  sql,
  datasourceIds,
  dashboardId,
  sqlParams,
  tenantFieldName,
  previewTenantId,
}: {
  sql: string;
  datasourceIds: string[];
  dashboardId?: string;
  sqlParams: Record<string, unknown>;
  tenantFieldName?: string;
  previewTenantId?: string;
}): BlockSqlPayload {
  const tenantField = tenantFieldName?.trim() || undefined;
  const previewTenant = previewTenantId?.trim() || undefined;
  return {
    sql,
    datasourceIds,
    ...(dashboardId ? { dashboardId } : {}),
    params: sqlParams,
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
