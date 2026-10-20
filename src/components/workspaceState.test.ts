import { describe, expect, it } from "vitest";
import type { ChartBlockSummary } from "./dashboardEditorController";
import { stripEmbeddedDataFromBlocks } from "./stripEmbeddedDataFromBlocks";
import {
  buildDashboardContext,
  chartLabel,
  applyChartChange,
  findChangeTarget,
  buildChartRefMap,
  findChartBlockSnapshot,
  summarizeChartChange,
  type ChartEditorLike,
  chartRefKey,
  collectMissingChartIds,
  linkifyChartRefs,
  nextIntent,
  selectableIntents,
  resolveChartRef,
  validateTagsForSend,
  detectMention,
  removeMention,
  filterChartsForPicker,
  findChartSpec,
  MAX_COMPACT_SQL_LENGTH,
  resolveDatasourceId,
  resolveTags,
} from "./workspaceState";

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};

const chart = (over: Partial<ChartBlockSummary>): ChartBlockSummary => ({
  id: "b",
  chartId: "c",
  type: "chart",
  title: "T",
  presentationKind: "chart",
  sql: "select 1",
  datasourceIds: [],
  resultId: "",
  ...over,
});

describe("collectMissingChartIds", () => {
  const blocks = () => [
    { id: "p", type: "paragraph" },
    { id: "a", type: "chart", props: { chartId: "" } },
    { id: "cols", type: "columnList", children: [{ id: "b", type: "json-render-chart", props: {} }] },
    { id: "k", type: "chart", props: { chartId: "keep" } },
  ];

  it("assigns ids to charts without one, including nested, and skips existing", () => {
    expect(collectMissingChartIds(blocks(), counter())).toEqual([
      { blockId: "a", chartId: "id1" },
      { blockId: "b", chartId: "id2" },
    ]);
  });

  it("is idempotent once ids are applied", () => {
    const doc = blocks();
    for (const { blockId, chartId } of collectMissingChartIds(doc, counter())) {
      const find = (list: typeof doc): (typeof doc)[number] | undefined =>
        list.flatMap((b) => [b, ...((b as { children?: typeof doc }).children ?? [])]).find((b) => b.id === blockId);
      (find(doc)!.props as Record<string, unknown>).chartId = chartId;
    }
    expect(collectMissingChartIds(doc, counter())).toEqual([]);
  });

  it("re-ids a duplicated id (copy/paste) but keeps the first", () => {
    const doc = [
      { id: "a", type: "chart", props: { chartId: "dup" } },
      { id: "b", type: "chart", props: { chartId: "dup" } },
    ];
    expect(collectMissingChartIds(doc, counter())).toEqual([{ blockId: "b", chartId: "id1" }]);
  });

  it("never reuses an id already present on a later block", () => {
    const doc = [
      { id: "a", type: "chart", props: {} },
      { id: "b", type: "chart", props: { chartId: "id1" } },
    ];
    const result = collectMissingChartIds(doc, counter());
    expect(result).toEqual([{ blockId: "a", chartId: "id2" }]);
  });

  it("ids survive a save/load round trip", () => {
    const doc = [{ id: "a", type: "chart", props: { chartId: "stable", chartSpec: "{}" } }];
    const saved = JSON.stringify(stripEmbeddedDataFromBlocks(doc as never));
    expect(collectMissingChartIds(JSON.parse(saved), counter())).toEqual([]);
    expect(JSON.parse(saved)[0].props.chartId).toBe("stable");
  });
});

describe("picker", () => {
  const charts = [chart({ chartId: "1", title: "Revenue by month" }), chart({ chartId: "2", title: "  " })];

  it("labels untitled charts with a fallback", () => {
    expect(chartLabel(charts[1]!, 1)).toBe("Untitled chart 2");
  });

  it("filters by label, case-insensitively", () => {
    expect(filterChartsForPicker(charts, "REV").map((r) => r.chart.chartId)).toEqual(["1"]);
    expect(filterChartsForPicker(charts, "untitled").map((r) => r.chart.chartId)).toEqual(["2"]);
    expect(filterChartsForPicker(charts, "")).toHaveLength(2);
  });
});

describe("resolveTags", () => {
  const charts = [chart({ chartId: "1" }), chart({ chartId: "2" })];

  it("resolves live tags once and reports dead ones", () => {
    const { resolved, missingIds } = resolveTags(["2", "2", "gone"], charts);
    expect(resolved.map((c) => c.chartId)).toEqual(["2"]);
    expect(missingIds).toEqual(["gone"]);
  });
});

describe("resolveDatasourceId", () => {
  it("prefers the tagged chart's datasource over the selection", () => {
    expect(resolveDatasourceId([chart({ datasourceIds: ["tagged"] })], "chat")).toBe("tagged");
  });

  it("falls back to the selection", () => {
    expect(resolveDatasourceId([], "chat")).toBe("chat");
    expect(resolveDatasourceId([chart({ datasourceIds: [] })], "chat")).toBe("chat");
  });
});

describe("buildDashboardContext", () => {
  it("lists all charts compactly and tagged ones in full", () => {
    const longSql = "x".repeat(MAX_COMPACT_SQL_LENGTH + 50);
    const charts = [
      chart({ chartId: "1", title: "A", sql: longSql, datasourceIds: ["ds"] }),
      chart({ chartId: "2", title: "", sql: "select 2" }),
    ];
    const ctx = buildDashboardContext(charts, ["1", "dead"], (id) => ({ spec: id }));
    expect(ctx.charts).toHaveLength(2);
    expect(ctx.charts[0]!.sql.length).toBe(MAX_COMPACT_SQL_LENGTH + 1);
    expect(ctx.charts[1]!.title).toBe("Untitled chart 2");
    expect(ctx.tagged).toEqual([
      { ref: "c1", id: "1", title: "A", kind: "chart", datasourceId: "ds", sql: longSql, spec: { spec: "1" } },
    ]);
  });
});

describe("findChartSpec", () => {
  it("reads the spec of a nested chart by chart id", () => {
    const doc = [
      { id: "cols", type: "columnList", children: [
        { id: "j", type: "json-render-chart", props: { chartId: "z", jsonRenderSpec: '{"root":"m"}' } },
      ] },
    ];
    expect(findChartSpec(doc, "z")).toEqual({ root: "m" });
    expect(findChartSpec(doc, "nope")).toBeUndefined();
  });
});

describe("mentions", () => {
  it("detects a trailing @query", () => {
    expect(detectMention("how is @rev")).toEqual({ query: "rev", start: 7 });
    expect(detectMention("@")).toEqual({ query: "", start: 0 });
  });

  it("ignores emails and finished mentions", () => {
    expect(detectMention("mail me@x.com")).toBeNull();
    expect(detectMention("@rev done")).toBeNull();
  });

  it("removes the trailing mention", () => {
    expect(removeMention("how is @rev")).toBe("how is ");
    expect(removeMention("plain")).toBe("plain");
  });
});

describe("chart refs in answers", () => {
  const charts = [chart({ chartId: "1", title: "A" }), chart({ chartId: "2", title: "B" })];
  const refMap = buildChartRefMap(buildDashboardContext(charts, [], () => undefined));

  it("hands out positional refs", () => {
    expect(chartRefKey(0)).toBe("c1");
    expect(refMap).toEqual({ c1: { chartId: "1", title: "A" }, c2: { chartId: "2", title: "B" } });
  });

  it("linkifies [↗ cN] only", () => {
    expect(linkifyChartRefs("See [↗ c1] and [↗c12], not [c1] or [↗ x]")).toBe(
      "See [c1](#qp-chart-c1) and [c12](#qp-chart-c12), not [c1] or [↗ x]",
    );
  });

  it("resolves a live ref against the current Dashboard", () => {
    const renamed = [chart({ chartId: "1", title: "A renamed" })];
    expect(resolveChartRef("c1", refMap, renamed)).toEqual({ label: "A renamed", chartId: "1", removed: false });
  });

  it("keeps the title snapshot for a deleted chart and treats unknown refs as removed", () => {
    expect(resolveChartRef("c2", refMap, [charts[0]!])).toEqual({ label: "B", chartId: "2", removed: true });
    expect(resolveChartRef("c9", refMap, charts)).toEqual({ label: "c9", chartId: null, removed: true });
    expect(resolveChartRef("c1", undefined, charts).removed).toBe(true);
  });
});

describe("validateTagsForSend", () => {
  const charts = [chart({ chartId: "1" })];

  it("allows live tags and blocks removed ones", () => {
    expect(validateTagsForSend(["1"], charts)).toBeNull();
    expect(validateTagsForSend([], charts)).toBeNull();
    expect(validateTagsForSend(["1", "gone"], charts)).toMatch(/removed/);
  });
});

describe("tag intent helpers", () => {
  it("only offers modify/replace for exactly one tagged chart", () => {
    expect(selectableIntents(1)).toEqual(["investigate", "modify", "replace"]);
    expect(selectableIntents(2)).toEqual(["investigate"]);
  });

  it("cycles the badge intent and stays investigate with several tags", () => {
    expect(nextIntent("investigate", 1)).toBe("modify");
    expect(nextIntent("modify", 1)).toBe("replace");
    expect(nextIntent("replace", 1)).toBe("investigate");
    expect(nextIntent("investigate", 3)).toBe("investigate");
  });

  it("includes the decided intent in the request context", () => {
    const ctx = buildDashboardContext([chart({ chartId: "1" })], ["1"], () => undefined, "modify");
    expect(ctx.tagIntent).toBe("modify");
    expect(buildDashboardContext([], [], () => undefined).tagIntent).toBeUndefined();
  });
});

describe("applyChartChange", () => {
  const payload = { chartSpec: { kind: "chart", description: "Weekly revenue", data: [] }, sql: "select 2" };

  function fakeEditor(block: { type: string; props?: Record<string, unknown> } | undefined) {
    const calls: Array<{ op: string; args?: unknown[] }> = [];
    const editor: ChartEditorLike = {
      getBlock: (id) => (id === "b1" ? block : undefined),
      transact: (fn) => {
        calls.push({ op: "transact" });
        fn();
      },
      updateBlock: (...args) => calls.push({ op: "updateBlock", args }),
    };
    return { editor, calls };
  }

  it("modify swaps the block in place in one transaction and keeps the chart id", () => {
    const { editor, calls } = fakeEditor({ type: "chart", props: { chartId: "keep" } });
    const result = applyChartChange(editor, { blockId: "b1", mode: "modify", payload, generateId: () => "new" });
    expect(result).toEqual({ ok: true, chartId: "keep" });
    expect(calls.map((c) => c.op)).toEqual(["transact", "updateBlock"]);
    const [blockId, update] = calls[1]!.args as [string, { type: string; props: Record<string, string> }];
    expect(blockId).toBe("b1");
    expect(update.type).toBe("chart");
    expect(update.props.chartId).toBe("keep");
    expect(update.props.sql).toBe("select 2");
  });

  it("modify keeps the chart id even when the block type changes", () => {
    const { editor, calls } = fakeEditor({ type: "json-render-chart", props: { chartId: "keep" } });
    applyChartChange(editor, { blockId: "b1", mode: "modify", payload });
    expect((calls[1]!.args as [string, { props: Record<string, string> }])[1].props.chartId).toBe("keep");
  });

  it("replace swaps in place with a new chart id, still one transaction", () => {
    const { editor, calls } = fakeEditor({ type: "chart", props: { chartId: "old" } });
    const result = applyChartChange(editor, { blockId: "b1", mode: "replace", payload, generateId: () => "new" });
    expect(result).toEqual({ ok: true, chartId: "new" });
    expect(calls.filter((c) => c.op === "transact")).toHaveLength(1);
    expect((calls[1]!.args as [string, { props: Record<string, string> }])[1].props.chartId).toBe("new");
  });

  it("modify assigns an id when the block had none", () => {
    const { editor } = fakeEditor({ type: "chart", props: {} });
    expect(applyChartChange(editor, { blockId: "b1", mode: "modify", payload, generateId: () => "fresh" })).toEqual({
      ok: true,
      chartId: "fresh",
    });
  });

  it("does nothing for a missing block, a non-chart block or an empty payload", () => {
    const missing = fakeEditor(undefined);
    expect(applyChartChange(missing.editor, { blockId: "b1", mode: "modify", payload })).toEqual({ ok: false });
    const para = fakeEditor({ type: "paragraph" });
    expect(applyChartChange(para.editor, { blockId: "b1", mode: "modify", payload })).toEqual({ ok: false });
    const empty = fakeEditor({ type: "chart", props: {} });
    expect(applyChartChange(empty.editor, { blockId: "b1", mode: "modify", payload: {} })).toEqual({ ok: false });
    expect([missing, para, empty].flatMap((f) => f.calls)).toEqual([]);
  });
});

describe("summarizeChartChange / findChartBlockSnapshot", () => {
  it("describes what changed", () => {
    const base = { title: "Revenue", presentationKind: "chart" as const, sql: "select 1" };
    expect(summarizeChartChange(base, { ...base })).toBe("Same SQL");
    expect(summarizeChartChange(base, { ...base, presentationKind: "table" })).toBe("Shown as table instead of chart · Same SQL");
    expect(summarizeChartChange(base, { ...base, sql: "SELECT  2", title: "Weekly" })).toBe("Updated SQL · Title: Revenue → Weekly");
    expect(summarizeChartChange(base, { ...base, sql: "select\n1" })).toBe("Same SQL");
  });

  it("snapshots a nested chart with parsed spec and params", () => {
    const summaries = [chart({ chartId: "z", title: "T", sql: "select 1", datasourceIds: ["ds"] })];
    const doc = [{ id: "cols", type: "columnList", children: [
      { id: "b", type: "chart", props: { chartId: "z", chartSpec: '{"kind":"chart"}', sqlParams: '{"a":1}' } },
    ] }];
    expect(findChartBlockSnapshot(doc, "z", summaries)).toMatchObject({
      blockId: "b", chartId: "z", sql: "select 1", params: { a: 1 }, datasourceId: "ds", chartSpec: { kind: "chart" },
    });
    expect(findChartBlockSnapshot(doc, "nope", summaries)).toBeUndefined();
  });
});

describe("findChangeTarget", () => {
  const user = (over: object) => ({ id: "u", role: "user", ...over });

  it("targets the single tagged chart of a modify/replace turn", () => {
    const messages = [user({ intent: "modify", taggedCharts: [{ chartId: "c1" }] }), { id: "a", role: "assistant" }];
    expect(findChangeTarget(messages, "a")).toEqual({ chartId: "c1", mode: "modify" });
    expect(findChangeTarget([user({ intent: "replace", taggedCharts: [{ chartId: "c1" }] }), { id: "a", role: "assistant" }], "a")?.mode).toBe("replace");
  });

  it("returns null for investigate, several tags, no tags or an unknown turn", () => {
    const a = { id: "a", role: "assistant" };
    expect(findChangeTarget([user({ intent: "investigate", taggedCharts: [{ chartId: "c1" }] }), a], "a")).toBeNull();
    expect(findChangeTarget([user({ intent: "modify", taggedCharts: [{ chartId: "1" }, { chartId: "2" }] }), a], "a")).toBeNull();
    expect(findChangeTarget([user({ intent: "modify" }), a], "a")).toBeNull();
    expect(findChangeTarget([user({ intent: "modify", taggedCharts: [{ chartId: "c1" }] }), a], "missing")).toBeNull();
  });

  it("only looks at the nearest preceding user message", () => {
    const messages = [
      user({ id: "u1", intent: "modify", taggedCharts: [{ chartId: "c1" }] }),
      { id: "a1", role: "assistant" },
      user({ id: "u2" }),
      { id: "a2", role: "assistant" },
    ];
    expect(findChangeTarget(messages, "a2")).toBeNull();
  });
});
