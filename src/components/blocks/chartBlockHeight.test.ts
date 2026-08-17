import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_HEIGHT,
  DEFAULT_METRIC_HEIGHT,
  parseBlockHeight,
  resolveChartBlockHeight,
} from "./chartBlockHeight";

describe("parseBlockHeight", () => {
  it("parses numeric and string heights", () => {
    expect(parseBlockHeight(240)).toBe(240);
    expect(parseBlockHeight("110")).toBe(110);
    expect(parseBlockHeight("nope")).toBeUndefined();
  });
});

describe("resolveChartBlockHeight", () => {
  it("uses compact height for metrics when height is missing or the chart default", () => {
    expect(resolveChartBlockHeight(undefined, "metric")).toBe(DEFAULT_METRIC_HEIGHT);
    expect(resolveChartBlockHeight(DEFAULT_CHART_HEIGHT, "metric")).toBe(
      DEFAULT_METRIC_HEIGHT
    );
  });

  it("keeps an explicit metric height", () => {
    expect(resolveChartBlockHeight(110, "metric")).toBe(110);
  });

  it("uses the chart default for non-metrics", () => {
    expect(resolveChartBlockHeight(undefined, "chart")).toBe(DEFAULT_CHART_HEIGHT);
    expect(resolveChartBlockHeight(240, "chart")).toBe(240);
  });
});
