import { describe, expect, it } from "vitest";
import { vizKindOf } from "./vizKind";

const chart = (chartType: string) => ({ kind: "chart", encoding: { chartType } });

describe("vizKindOf", () => {
  it("maps chart types to families", () => {
    expect(vizKindOf({ chartSpec: chart("column") })).toBe("bar");
    expect(vizKindOf({ chartSpec: chart("bar") })).toBe("bar");
    expect(vizKindOf({ chartSpec: chart("line") })).toBe("line");
    expect(vizKindOf({ chartSpec: chart("area") })).toBe("line");
    expect(vizKindOf({ chartSpec: chart("pie") })).toBe("pie");
    expect(vizKindOf({ chartSpec: chart("scatter") })).toBe("chart");
  });
  it("reads table and metric specs, also as JSON strings", () => {
    expect(vizKindOf({ chartSpec: { kind: "table" } })).toBe("table");
    expect(vizKindOf({ chartSpec: JSON.stringify({ kind: "metric" }) })).toBe("metric");
  });
  it("falls back to jsonRenderSpec, then presentationKind", () => {
    expect(vizKindOf({ jsonRenderSpec: chart("line") })).toBe("line");
    expect(vizKindOf({ presentationKind: "metric" })).toBe("metric");
    expect(vizKindOf({ chartSpec: "not json", presentationKind: "table" })).toBe("table");
    expect(vizKindOf({})).toBe("chart");
  });
});
