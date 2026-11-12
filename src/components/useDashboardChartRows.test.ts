import { afterEach, describe, expect, it, vi } from "vitest";
import { chartsClientFor } from "./dashboardCharts";
import { createChartRowSync } from "./useDashboardChartRows";

type Block = { id: string; type: string; props: Record<string, unknown>; children: Block[] };

const spec = { root: "x" };
const row = { id: "row-1", tenant_id: null, title: "T", sql: "SELECT 1", query_id: null, vega_lite_spec: spec, datasource_id: "ds" };

function fakeEditor(blocks: Block[]) {
  return {
    document: blocks,
    updateBlock: vi.fn((id: string, update: { props: Record<string, unknown> }) => {
      const block = blocks.find((b) => b.id === id)!;
      block.props = { ...block.props, ...update.props };
    }),
    onChange: vi.fn(),
  };
}

function mockApi(rows: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      const payload = init.method === "GET" ? { charts: rows } : { id: "new-row" };
      return { ok: true, status: 200, json: async () => payload } as Response;
    }),
  );
  return calls;
}

const client = chartsClientFor({ apiBaseUrl: "", dashboardId: "d1", headers: {} })!;
const stored = (props: Record<string, unknown> = {}): Block => ({
  id: "b1",
  type: "json-render-chart",
  props: { savedChartId: "row-1", title: "T", ...props },
  children: [],
});
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("createChartRowSync", () => {
  it("fills a stripped block in from its row on load, without syncing it back", async () => {
    const calls = mockApi([row]);
    const editor = fakeEditor([stored()]);
    const sync = createChartRowSync(editor, () => client);

    await sync.load();
    sync.changed();
    await flushPromises();

    expect(editor.document[0]!.props.sql).toBe("SELECT 1");
    expect(calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
  });

  it("updates the row as soon as a stored block's query changes, by any path", async () => {
    const calls = mockApi([row]);
    const editor = fakeEditor([stored()]);
    const sync = createChartRowSync(editor, () => client);
    await sync.load();

    editor.document[0]!.props = { ...editor.document[0]!.props, sql: "SELECT 2" };
    sync.changed();
    await flushPromises();

    expect(calls).toContain("PUT /api/dashboards/d1/charts/row-1");
  });

  it("does not watch blocks without a row; flush gives them one and starts watching", async () => {
    const calls = mockApi([]);
    const unsaved: Block = {
      id: "b2",
      type: "json-render-chart",
      props: { title: "T", sql: "SELECT 3", jsonRenderSpec: JSON.stringify(spec), datasourceIds: '["ds"]', sqlParams: "{}" },
      children: [],
    };
    const editor = fakeEditor([unsaved]);
    const sync = createChartRowSync(editor, () => client);
    await sync.load();

    unsaved.props = { ...unsaved.props, sql: "SELECT 4" };
    sync.changed();
    await flushPromises();
    expect(calls.filter((c) => !c.startsWith("GET"))).toEqual([]);

    await sync.flush();
    expect(editor.document[0]!.props.savedChartId).toBe("new-row");
    expect(calls).toContain("POST /api/dashboards/d1/charts");
  });
});
