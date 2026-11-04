import { describe, expect, it } from "vitest";
import {
  STATUS_COLORS,
  assignCategoryColors,
  buildMarkers,
  categoryOf,
  donutSlices,
  groupLatLngRows,
  legendCategories,
  markerRadius,
  presetColor,
} from "./vizSpecMapMarkers";

describe("presetColor", () => {
  it("maps status presets case-insensitively", () => {
    expect(presetColor("Active")).toBe(STATUS_COLORS.green);
    expect(presetColor("ONLINE")).toBe(STATUS_COLORS.green);
    expect(presetColor("running")).toBe(STATUS_COLORS.green);
    expect(presetColor("Standby")).toBe(STATUS_COLORS.amber);
    expect(presetColor("idle")).toBe(STATUS_COLORS.amber);
    expect(presetColor("Fault")).toBe(STATUS_COLORS.red);
    expect(presetColor("offline")).toBe(STATUS_COLORS.red);
    expect(presetColor("error")).toBe(STATUS_COLORS.red);
  });

  it("maps unknown, null and empty to grey", () => {
    expect(presetColor("Unknown")).toBe(STATUS_COLORS.grey);
    expect(presetColor(categoryOf(null))).toBe(STATUS_COLORS.grey);
    expect(presetColor(categoryOf("  "))).toBe(STATUS_COLORS.grey);
  });

  it("returns null for custom values", () => {
    expect(presetColor("maintenance")).toBeNull();
  });
});

describe("assignCategoryColors", () => {
  it("uses presets and cycles the palette for custom categories", () => {
    const colors = assignCategoryColors(["active", "gold", "silver", "bronze", "Idle"], ["#1", "#2", "#3"]);
    expect(colors.get("active")).toBe(STATUS_COLORS.green);
    expect(colors.get("Idle")).toBe(STATUS_COLORS.amber);
    expect(colors.get("gold")).toBe("#1");
    expect(colors.get("silver")).toBe("#2");
    expect(colors.get("bronze")).toBe("#3");
  });
});

describe("grouping", () => {
  const rows = [
    { lat: 47.5, lng: 19, s: "active" },
    { lat: 47.5, lng: 19, s: "Active" },
    { lat: 47.5, lng: 19, s: "idle" },
    { lat: 46, lng: 20, s: null },
    { lat: "x", lng: 20, s: "active" },
  ];

  it("groups identical lat/lng rows into one point and skips invalid ones", () => {
    const points = groupLatLngRows(rows, "lat", "lng");
    expect(points.map((p) => p.rowIndexes)).toEqual([[0, 1, 2], [3]]);
  });

  it("counts per category (case-sensitive values, null as unknown)", () => {
    const markers = buildMarkers(groupLatLngRows(rows, "lat", "lng"), rows, "s");
    expect(markers[0]).toMatchObject({
      total: 3,
      name: null,
      counts: [
        { category: "active", count: 1 },
        { category: "Active", count: 1 },
        { category: "idle", count: 1 },
      ],
    });
    expect(markers[1]?.counts).toEqual([{ category: "unknown", count: 1 }]);
    expect(legendCategories(markers)).toEqual(["active", "Active", "idle", "unknown"]);
  });

  it("without a color column gives one uncategorised count and an empty legend", () => {
    const markers = buildMarkers(groupLatLngRows(rows, "lat", "lng"), rows, null);
    expect(markers[0]?.counts).toEqual([{ category: "", count: 3 }]);
    expect(legendCategories(markers)).toEqual([]);
  });

  it("keeps the resolved place name", () => {
    const markers = buildMarkers([{ lat: 1, lng: 2, resolvedName: "Fadd", rowIndexes: [0] }], rows, null);
    expect(markers[0]?.name).toBe("Fadd");
  });
});

describe("markerRadius", () => {
  it("makes area proportional to count", () => {
    const small = markerRadius(1, 4, 20, 0);
    const big = markerRadius(4, 4, 20, 0);
    expect(big).toBe(20);
    expect(big ** 2 / small ** 2).toBeCloseTo(4);
  });

  it("never goes below the minimum", () => {
    expect(markerRadius(1, 1000, 20)).toBe(4);
  });
});

describe("donutSlices", () => {
  it("sizes slice angles proportionally and sums to a full circle", () => {
    const slices = donutSlices([{ category: "a", count: 3 }, { category: "b", count: 1 }], 0, 0, 10, 5);
    expect(slices[0]?.angle).toBeCloseTo(Math.PI * 1.5);
    expect(slices[1]?.angle).toBeCloseTo(Math.PI * 0.5);
    expect(slices.reduce((s, x) => s + x.angle, 0)).toBeCloseTo(Math.PI * 2);
    expect(slices[0]?.path).toMatch(/^M .* A 10 10 0 1 1 /);
  });

  it("draws a single category as a full ring", () => {
    const [slice] = donutSlices([{ category: "a", count: 5 }], 0, 0, 10, 5);
    expect(slice?.angle).toBeCloseTo(Math.PI * 2);
    expect(slice?.path.match(/A /g)).toHaveLength(4);
  });

  it("returns nothing for zero counts", () => {
    expect(donutSlices([], 0, 0, 10, 5)).toEqual([]);
  });
});
