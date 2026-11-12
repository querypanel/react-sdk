import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chartPatchFromRow,
  chartsClientFor,
  stripStoredChartQueries,
  syncDashboardChartRows,
  type DashboardChartRow,
} from "./dashboardCharts";

const spec = { kind: "chart", title: "Revenue" };
const chartBlock = (props: Record<string, unknown>, id = "b1") => ({
  id,
  type: "chart",
  props: {
    title: "Revenue",
    chartSpec: JSON.stringify({ ...spec, data: [{ n: 1 }] }),
    sql: "SELECT 1",
    sqlParams: '{"1":"t"}',
    datasourceIds: '["ds-1"]',
    queryId: "",
    savedChartId: "",
    ...props,
  },
  children: [],
});
const row = (overrides: Partial<DashboardChartRow> = {}): DashboardChartRow => ({
  id: "row-1",
  tenant_id: null,
  title: "Revenue",
  sql: "SELECT 1",
  query_id: null,
  vega_lite_spec: spec,
  datasource_id: "ds-1",
  ...overrides,
});

function mockApi(rows: DashboardChartRow[]) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: String(init.method), body });
      const payload = init.method === "GET" ? { charts: rows } : { id: "new-row", ...body };
      return { ok: true, status: 200, json: async () => payload } as Response;
    }),
  );
  return calls;
}

const admin = chartsClientFor({ apiBaseUrl: "", dashboardId: "d1", headers: {}, organizationId: "org" })!;
const tenant = chartsClientFor({ apiBaseUrl: "https://api.test", dashboardId: "d1", headers: {} })!;

afterEach(() => vi.unstubAllGlobals());

describe("chartsClientFor", () => {
  it("uses the admin proxy without an API base, and stores tenant charts with one", () => {
    expect(admin).toMatchObject({ url: "/api/dashboards/d1/charts", tenantOwned: false });
    expect(tenant).toMatchObject({ url: "https://api.test/dashboards/d1/charts", tenantOwned: true });
  });
});

describe("syncDashboardChartRows", () => {
  it("creates an org chart from the admin editor with the block's SQL and the spec without rows", async () => {
    const calls = mockApi([]);
    const assigned = await syncDashboardChartRows([chartBlock({})], admin);
    expect(assigned.get("b1")).toBe("new-row");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/dashboards/d1/charts");
    expect(post.body).toEqual({
      title: "Revenue",
      spec,
      datasource_id: "ds-1",
      sql: "SELECT 1",
      sql_params: { "1": "t" },
    });
  });

  it("creates tenant charts from the stored query only, never SQL", async () => {
    const calls = mockApi([]);
    const assigned = await syncDashboardChartRows(
      [chartBlock({ queryId: "q1" }), chartBlock({}, "legacy")],
      tenant,
    );
    expect([...assigned.keys()]).toEqual(["b1"]);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ title: "Revenue", spec, datasource_id: "ds-1", query_id: "q1" });
  });

  it("leaves unchanged rows alone and updates a changed one", async () => {
    const calls = mockApi([row()]);
    await syncDashboardChartRows([chartBlock({ savedChartId: "row-1" })], admin);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);

    const changed = mockApi([row()]);
    await syncDashboardChartRows([chartBlock({ savedChartId: "row-1", sql: "SELECT 2" })], admin);
    expect(changed.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/dashboards/d1/charts",
      "PUT /api/dashboards/d1/charts/row-1",
    ]);
  });

  it("gives a tenant their own copy when they change an org chart's query", async () => {
    const calls = mockApi([row({ query_id: "admin-q" })]);
    const assigned = await syncDashboardChartRows(
      [chartBlock({ savedChartId: "row-1", sql: "SELECT 2", queryId: "tenant-q" })],
      tenant,
    );
    expect(assigned.get("b1")).toBe("new-row");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("does not touch an org chart a tenant only re-rendered", async () => {
    const calls = mockApi([row({ query_id: "admin-q" })]);
    await syncDashboardChartRows([chartBlock({ savedChartId: "row-1", title: "Renamed", queryId: "admin-q" })], tenant);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });
});

describe("chartPatchFromRow", () => {
  it("brings a block up to date with an edited row", () => {
    const patch = chartPatchFromRow(
      chartBlock({ savedChartId: "row-1" }),
      row({ sql: "SELECT 2", title: "New", query_id: "q2", sql_params: null }),
    );
    expect(patch).toEqual({
      chartSpec: JSON.stringify(spec),
      sql: "SELECT 2",
      title: "New",
      queryId: "q2",
      datasourceIds: '["ds-1"]',
    });
  });

  it("returns null when the block matches its row", () => {
    expect(chartPatchFromRow(chartBlock({ savedChartId: "row-1" }), row())).toBeNull();
  });
});

describe("stripStoredChartQueries", () => {
  it("keeps only the reference, layout and labels for blocks with a row, nested ones included", () => {
    const stored = chartBlock({ savedChartId: "row-1", queryId: "q1", width: "100%", height: 400 });
    const legacy = chartBlock({}, "b2");
    const [column, plain] = stripStoredChartQueries([
      { id: "col", type: "column", props: {}, children: [stored] },
      legacy,
    ]) as any[];
    expect(column.children[0].props).toEqual({ title: "Revenue", savedChartId: "row-1", width: "100%", height: 400 });
    expect(plain).toEqual(legacy);
  });

  it("a stripped block is filled back in from its row", () => {
    const stripped = { id: "b1", type: "chart", props: { title: "Revenue", savedChartId: "row-1" }, children: [] };
    expect(chartPatchFromRow(stripped, row({ sql_params: [{ name: "tenant_id", value: "x" }] }))).toEqual({
      chartSpec: JSON.stringify(spec),
      sql: "SELECT 1",
      sqlParams: '{"1":"x","tenant_id":"x"}',
      title: "Revenue",
      queryId: "",
      datasourceIds: '["ds-1"]',
    });
  });
});
