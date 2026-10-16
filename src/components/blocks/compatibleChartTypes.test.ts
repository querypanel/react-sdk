import { describe, expect, it } from "vitest";
import { compatibleChartTypes } from "./compatibleChartTypes";

describe("compatibleChartTypes", () => {
  it("offers cartesian + pie for country/revenue shape", () => {
    const types = compatibleChartTypes(
      ["country", "revenue"],
      [
        { country: "US", revenue: 100 },
        { country: "UK", revenue: 80 },
      ]
    );
    expect(types).toContain("column");
    expect(types).toContain("bar");
    expect(types).toContain("line");
    expect(types).toContain("pie");
    expect(types).not.toContain("scatter");
  });

  it("offers scatter when two numeric fields exist", () => {
    const types = compatibleChartTypes(
      ["x", "y", "label"],
      [
        { x: 1, y: 2, label: "a" },
        { x: 3, y: 4, label: "b" },
      ]
    );
    expect(types).toContain("scatter");
  });

  it("falls back to column/bar/line/area when fields are unknown", () => {
    expect(compatibleChartTypes([])).toEqual(["column", "bar", "line", "area"]);
  });
});
