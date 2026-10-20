import { describe, expect, it } from "vitest";
import type { ChartBlockSummary } from "./dashboardEditorController";
import { stripEmbeddedDataFromBlocks } from "./stripEmbeddedDataFromBlocks";
import {
  buildDashboardContext,
  chartLabel,
  buildChartRefMap,
  chartRefKey,
  collectMissingChartIds,
  linkifyChartRefs,
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
