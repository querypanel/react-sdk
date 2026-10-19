import { describe, expect, it } from "vitest";
import {
  buildChartBlockInput,
  buildChartPropsPatch,
  listChartBlocks,
} from "./dashboardEditorController";

const vizSpec = { kind: "chart", description: "Revenue by month", data: [] };
const jsonRenderSpec = {
  root: "m",
  elements: { m: { type: "Metric", props: { title: "Total", value: 1 }, children: [] } },
};

describe("buildChartBlockInput", () => {
  it("returns null without a spec", () => {
    expect(buildChartBlockInput({ sql: "select 1" })).toBeNull();
  });

  it("builds a chart block from a VizSpec", () => {
    const input = buildChartBlockInput({
      chartSpec: vizSpec,
      sql: "select 1",
      datasourceIds: ["ds1"],
      resultId: "r1",
    });
    expect(input?.type).toBe("chart");
    expect(input?.props).toMatchObject({
      chartSpec: JSON.stringify(vizSpec),
      title: "Revenue by month",
      sql: "select 1",
      datasourceIds: '["ds1"]',
      sqlParams: "{}",
    });
    expect(input?.props).not.toHaveProperty("resultId");
  });

  it("builds a json-render block and keeps the result id", () => {
    const input = buildChartBlockInput({ jsonRenderSpec, resultId: "r1" });
    expect(input?.type).toBe("json-render-chart");
    expect(input?.props).toMatchObject({ title: "Total", resultId: "r1" });
  });

  it("detects json-render specs passed as chartSpec", () => {
    expect(buildChartBlockInput({ chartSpec: jsonRenderSpec })?.type).toBe("json-render-chart");
  });
});

describe("buildChartPropsPatch", () => {
  it("only includes fields present on the patch", () => {
    expect(buildChartPropsPatch("chart", { sql: "select 2" })).toEqual({ sql: "select 2" });
    expect(buildChartPropsPatch("chart", {})).toEqual({});
  });

  it("re-derives the title when the spec changes, unless a title is given", () => {
    expect(buildChartPropsPatch("chart", { chartSpec: vizSpec })).toEqual({
      chartSpec: JSON.stringify(vizSpec),
      title: "Revenue by month",
    });
    expect(buildChartPropsPatch("chart", { chartSpec: vizSpec, title: "Custom" })?.title).toBe(
      "Custom",
    );
  });

  it("returns null when the spec belongs to the other block type", () => {
    expect(buildChartPropsPatch("chart", { jsonRenderSpec })).toBeNull();
    expect(buildChartPropsPatch("json-render-chart", { chartSpec: vizSpec })).toBeNull();
  });

  it("ignores resultId on plain chart blocks", () => {
    expect(buildChartPropsPatch("chart", { resultId: "r1" })).toEqual({});
    expect(buildChartPropsPatch("json-render-chart", { resultId: "r1" })).toEqual({
      resultId: "r1",
    });
  });
});

describe("listChartBlocks", () => {
  it("lists chart blocks in order, including nested ones, and skips the rest", () => {
    const blocks = [
      { id: "p1", type: "paragraph" },
      {
        id: "c1",
        type: "chart",
        props: { chartSpec: JSON.stringify(vizSpec), title: "Revenue", sql: "select 1", datasourceIds: '["ds1"]' },
      },
      {
        id: "cols",
        type: "columnList",
        children: [
          {
            id: "col",
            type: "column",
            children: [
              {
                id: "j1",
                type: "json-render-chart",
                props: { jsonRenderSpec: JSON.stringify(jsonRenderSpec), title: "Total", resultId: "r9" },
              },
            ],
          },
        ],
      },
    ];
    expect(listChartBlocks(blocks)).toEqual([
      { id: "c1", type: "chart", title: "Revenue", presentationKind: "chart", sql: "select 1", datasourceIds: ["ds1"], resultId: "" },
      { id: "j1", type: "json-render-chart", title: "Total", presentationKind: "metric", sql: "", datasourceIds: [], resultId: "r9" },
    ]);
  });

  it("tolerates malformed props", () => {
    const [summary] = listChartBlocks([
      { id: "c", type: "chart", props: { chartSpec: "{nope", datasourceIds: "x" } },
    ]);
    expect(summary).toMatchObject({ presentationKind: null, datasourceIds: [], title: "" });
  });
});
