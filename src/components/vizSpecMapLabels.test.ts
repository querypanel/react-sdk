import { describe, expect, it } from "vitest";
import { DEFAULT_ITEM_NOUN, countLabel, keepIfPresent, markerIds, markerTitle, tooltipTitle } from "./vizSpecMapLabels";
import type { MapMarker } from "./vizSpecMapMarkers";

const marker = (over: Partial<MapMarker> = {}): MapMarker => ({
  lat: 47.5,
  lng: 19.04,
  name: null,
  total: 1,
  counts: [{ category: "", count: 1 }],
  rowIndexes: [0],
  ...over,
});

describe("countLabel", () => {
  const noun = { singular: "device", plural: "devices" };
  it("uses the singular for exactly one", () => {
    expect(countLabel(1, noun)).toBe("1 device");
  });
  it("uses the plural otherwise", () => {
    expect(countLabel(0, noun)).toBe("0 devices");
    expect(countLabel(3, noun)).toBe("3 devices");
  });
  it("defaults to generic items", () => {
    expect(countLabel(2, DEFAULT_ITEM_NOUN)).toBe("2 items");
  });
});

describe("markerIds", () => {
  it("derives the id from coordinates, independent of order", () => {
    const a = marker({ lat: 1, lng: 2 });
    const b = marker({ lat: 3, lng: 4 });
    expect(markerIds([a, b])).toEqual(["1,2", "3,4"]);
    expect(markerIds([b, a])).toEqual(["3,4", "1,2"]);
  });
  it("keeps ids unique for markers on the same coordinates", () => {
    expect(markerIds([marker(), marker(), marker()])).toEqual(["47.5,19.04", "47.5,19.04#1", "47.5,19.04#2"]);
  });
});

describe("keepIfPresent", () => {
  it("keeps an id that still exists", () => {
    expect(keepIfPresent(["a", "b"], "b")).toBe("b");
  });
  it("clears an id that is gone, and null stays null", () => {
    expect(keepIfPresent(["a"], "b")).toBeNull();
    expect(keepIfPresent(["a"], null)).toBeNull();
  });
});

describe("titles", () => {
  it("prefers the resolved name, then the row label, then coordinates", () => {
    const data = [{ device: "D-1" }, { device: "" }];
    expect(tooltipTitle(marker({ name: "Szeged" }), data, "device")).toBe("Szeged");
    expect(tooltipTitle(marker(), data, "device")).toBe("D-1");
    expect(tooltipTitle(marker({ rowIndexes: [1] }), data, "device")).toBe("47.500, 19.040");
    expect(markerTitle(marker())).toBe("47.500, 19.040");
  });
});
