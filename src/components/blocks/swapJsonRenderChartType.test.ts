import { describe, expect, it } from "vitest";
import {
  chartTypeFromJsonRenderSpec,
  patchVizSpecChartType,
  swapJsonRenderChartType,
} from "./pinnedChartModify";
import type { VizSpec } from "../VizSpecRenderer";

const spec = () => ({
  root: "c1",
  elements: { c1: { type: "BarChart", props: {} } },
});

describe("swapJsonRenderChartType", () => {
  it("swaps the root element type to LineChart", () => {
    const input = spec();
    const out = swapJsonRenderChartType(input, "line") as ReturnType<typeof spec>;
    expect(out.elements.c1.type).toBe("LineChart");
    expect(input.elements.c1.type).toBe("BarChart");
  });

  it("swaps the root element type to PieChart", () => {
    const out = swapJsonRenderChartType(spec(), "pie") as ReturnType<typeof spec>;
    expect(out.elements.c1.type).toBe("PieChart");
  });

  it("returns null for scatter and invalid specs", () => {
    expect(swapJsonRenderChartType(spec(), "scatter")).toBeNull();
    expect(swapJsonRenderChartType({ root: "x", elements: {} }, "line")).toBeNull();
  });
});

describe("chartTypeFromJsonRenderSpec", () => {
  it("maps root element types", () => {
    expect(chartTypeFromJsonRenderSpec(spec())).toBe("column");
    expect(chartTypeFromJsonRenderSpec(null)).toBe("");
  });
});

describe("patchVizSpecChartType", () => {
  it("sets encoding.chartType on chart specs without mutating", () => {
    const input = {
      kind: "chart",
      encoding: { chartType: "bar" },
    } as unknown as VizSpec;
    const out = patchVizSpecChartType(input, "line") as unknown as {
      encoding: { chartType: string };
    };
    expect(out.encoding.chartType).toBe("line");
    expect((input as unknown as { encoding: { chartType: string } }).encoding.chartType).toBe("bar");
  });
});
