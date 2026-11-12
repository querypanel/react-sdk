/**
 * Dashboard charts as server-side rows (sdk_charts). A chart block keeps the row id in
 * `savedChartId`; the row holds the SQL the dashboard runs, so the browser never decides it.
 *
 * Rows are synced when the dashboard is saved: a block without a row gets one, a block whose
 * SQL, title or spec changed updates its row. A tenant (embedded editor) cannot change an org
 * chart: when they changed its query, they get their own copy instead.
 */
import { runDedupedRequest } from "../utils/requestDedup";
import { mapGeneratedParams } from "../utils/sqlParams";
import { stripEmbeddedDataFromBlocks, type BlockLike } from "./stripEmbeddedDataFromBlocks";

export interface DashboardChartRow {
  id: string;
  tenant_id: string | null;
  title: string;
  sql: string;
  query_id: string | null;
  vega_lite_spec: unknown;
  datasource_id: string | null;
  /** `[{ name, value }]` in SQL order; null for org charts read by a tenant (bound at run time). */
  sql_params?: Array<{ name: string; value: unknown }> | null;
}

export interface DashboardChartsClient {
  /** `.../dashboards/:dashboardId/charts` (embed API or the admin proxy). */
  url: string;
  headers: Record<string, string>;
  organizationId?: string;
  /** Embedded editor: rows belong to the tenant and are created from stored queries only. */
  tenantOwned: boolean;
}

type ChartWrite = {
  title: string;
  spec: Record<string, unknown>;
  datasource_id: string;
  query_id?: string;
  sql?: string;
  sql_params?: Record<string, unknown>;
};

type ChartBlock = BlockLike & { id: string; props: Record<string, unknown> };

const CHART_TYPES = new Set(["chart", "json-render-chart"]);

export function resolveDashboardChartsUrl(apiBaseUrl: string, dashboardId: string): string {
  const path = `/dashboards/${encodeURIComponent(dashboardId)}/charts`;
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, "")}${path}` : `/api${path}`;
}

/**
 * Client for a dashboard's chart rows. Embedded editors (with an API base URL) store tenant
 * charts; the admin editor stores org charts through its `/api` proxy.
 */
export function chartsClientFor(input: {
  apiBaseUrl: string;
  dashboardId?: string;
  headers: Record<string, string>;
  organizationId?: string;
}): DashboardChartsClient | undefined {
  if (!input.dashboardId) return undefined;
  return {
    url: resolveDashboardChartsUrl(input.apiBaseUrl, input.dashboardId),
    headers: input.headers,
    organizationId: input.organizationId,
    tenantOwned: Boolean(input.apiBaseUrl),
  };
}

async function request<T>(
  client: DashboardChartsClient,
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${client.url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(client.organizationId ? { "x-organization-id": client.organizationId } : {}),
      ...client.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((parsed as { error?: string })?.error || `Dashboard chart request failed (${response.status})`);
  }
  return parsed as T;
}

/**
 * The dashboard's chart rows. `fresh` skips the short cache that lets concurrent loads (the
 * editor mounts twice while it detects the theme) share one request; saving always reads fresh.
 */
export async function listDashboardCharts(
  client: DashboardChartsClient,
  options: { fresh?: boolean } = {},
): Promise<DashboardChartRow[]> {
  const result = await runDedupedRequest(
    `dashboard-charts:${client.url}`,
    () => request<{ charts?: DashboardChartRow[] }>(client, "", "GET"),
    { cacheMs: 5_000, bypassCache: options.fresh },
  );
  return Array.isArray(result.charts) ? result.charts : [];
}

/** Chart blocks of a document, including those nested in columns. */
export function collectChartBlocks(blocks: BlockLike[]): ChartBlock[] {
  const found: ChartBlock[] = [];
  for (const block of blocks) {
    if (CHART_TYPES.has(block.type) && typeof block.id === "string" && block.props) {
      found.push(block as ChartBlock);
    }
    if (Array.isArray(block.children)) found.push(...collectChartBlocks(block.children));
  }
  return found;
}

function parseObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function firstDatasource(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : undefined;
  } catch {
    return undefined;
  }
}

/** What a block's row should hold, from the block with its embedded rows stripped. */
export function chartWriteForBlock(block: ChartBlock, tenantOwned: boolean): ChartWrite | null {
  const stripped = stripEmbeddedDataFromBlocks([block])[0] as ChartBlock;
  const props = stripped.props;
  const spec = parseObject(block.type === "chart" ? props.chartSpec : props.jsonRenderSpec);
  const sql = typeof props.sql === "string" ? props.sql.trim() : "";
  const datasourceId = firstDatasource(props.datasourceIds);
  if (!spec || !sql || !datasourceId) return null;
  const base = {
    title: typeof props.title === "string" && props.title ? props.title : "Chart",
    spec,
    datasource_id: datasourceId,
  };
  const queryId = typeof props.queryId === "string" ? props.queryId.trim() : "";
  if (tenantOwned) return queryId ? { ...base, query_id: queryId } : null;
  return { ...base, sql, sql_params: parseObject(props.sqlParams) ?? {} };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

function rowDiffers(row: DashboardChartRow, block: ChartBlock, write: ChartWrite): boolean {
  const blockSql = typeof block.props.sql === "string" ? block.props.sql : "";
  return (
    normalizeSql(row.sql) !== normalizeSql(blockSql) ||
    row.title !== write.title ||
    row.datasource_id !== write.datasource_id ||
    stableStringify(row.vega_lite_spec) !== stableStringify(write.spec)
  );
}

/**
 * Create or update the rows behind the document's chart blocks. Returns the row id for every
 * block that got a new row (block id → savedChartId), for the editor to write into the blocks.
 * Blocks it cannot store (a tenant chart without a stored query) are left as they are.
 */
export async function syncDashboardChartRows(
  blocks: BlockLike[],
  client: DashboardChartsClient,
): Promise<Map<string, string>> {
  const charts = collectChartBlocks(blocks);
  const assigned = new Map<string, string>();
  if (charts.length === 0) return assigned;

  const rows = new Map((await listDashboardCharts(client, { fresh: true })).map((row) => [row.id, row]));
  for (const block of charts) {
    const write = chartWriteForBlock(block, client.tenantOwned);
    const savedId = typeof block.props.savedChartId === "string" ? block.props.savedChartId : "";
    const row = savedId ? rows.get(savedId) : undefined;

    if (row) {
      if (!write || !rowDiffers(row, block, write)) continue;
      const orgChart = row.tenant_id === null;
      if (client.tenantOwned && orgChart) {
        // A tenant gets their own copy only when they changed the query.
        if (!write.query_id || write.query_id === row.query_id) continue;
      } else {
        await request(client, `/${encodeURIComponent(row.id)}`, "PUT", write);
        continue;
      }
    }
    if (!write) continue;
    const created = await request<DashboardChartRow>(client, "", "POST", write);
    assigned.set(block.id, created.id);
  }
  return assigned;
}

/** The query a row holds; a saved block with a row keeps none of it (the row is loaded on open). */
const ROW_OWNED_PROPS = ["sql", "sqlParams", "chartSpec", "jsonRenderSpec", "datasourceIds", "queryId", "resultId"];

/**
 * The document as it is saved: chart blocks with a row keep the reference (`savedChartId`),
 * layout and labels, not the query or spec. Blocks without a row are left whole.
 */
export function stripStoredChartQueries<T extends BlockLike>(blocks: T[]): T[] {
  return blocks.map((block) => {
    const children = Array.isArray(block.children) ? stripStoredChartQueries(block.children) : block.children;
    const savedChartId = block.props?.savedChartId;
    if (!CHART_TYPES.has(block.type) || typeof savedChartId !== "string" || !savedChartId) {
      return children === block.children ? block : { ...block, children };
    }
    const props = { ...block.props };
    for (const key of ROW_OWNED_PROPS) delete props[key];
    return { ...block, props, children };
  });
}

/**
 * Props that bring a block up to date with its row (the row is the source of truth: an admin's
 * edit to an org chart reaches every fork). Null when the block already matches or has no row.
 */
export function chartPatchFromRow(
  block: ChartBlock,
  row: DashboardChartRow | undefined,
): Record<string, string> | null {
  if (!row) return null;
  const write = chartWriteForBlock(block, false);
  if (write && !rowDiffers(row, block, write)) return null;
  return {
    [block.type === "chart" ? "chartSpec" : "jsonRenderSpec"]: JSON.stringify(row.vega_lite_spec ?? {}),
    sql: row.sql,
    ...(row.sql_params ? { sqlParams: JSON.stringify(mapGeneratedParams(row.sql_params) ?? {}) } : {}),
    title: row.title,
    queryId: row.query_id ?? "",
    ...(row.datasource_id ? { datasourceIds: JSON.stringify([row.datasource_id]) } : {}),
  };
}

/** Patches for every chart block whose row changed since the content was saved. */
export async function chartPatchesFromRows(
  blocks: BlockLike[],
  client: DashboardChartsClient,
): Promise<Map<string, Record<string, string>>> {
  const charts = collectChartBlocks(blocks).filter(
    (block) => typeof block.props.savedChartId === "string" && block.props.savedChartId,
  );
  const patches = new Map<string, Record<string, string>>();
  if (charts.length === 0) return patches;
  const rows = new Map((await listDashboardCharts(client)).map((row) => [row.id, row]));
  for (const block of charts) {
    const patch = chartPatchFromRow(block, rows.get(block.props.savedChartId as string));
    if (patch) patches.set(block.id, patch);
  }
  return patches;
}
