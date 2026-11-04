import { describe, expect, it } from "vitest";
import hungary from "./fixtures/hungary.topo.json";
import {
  buildMapProjection,
  extractLatLngPoints,
  projectPoint,
  toCoordinate,
  type MapTopology,
} from "./vizSpecMapGeometry";

const topology = hungary as unknown as MapTopology;

describe("toCoordinate", () => {
  it("accepts numbers and numeric strings", () => {
    expect(toCoordinate(47.5, 90)).toBe(47.5);
    expect(toCoordinate(" 19.04 ", 180)).toBe(19.04);
  });
  it("rejects missing, non-numeric and out-of-range values", () => {
    for (const v of [null, undefined, "", "abc", NaN, Infinity, 91, {}]) expect(toCoordinate(v, 90)).toBeNull();
  });
});

describe("extractLatLngPoints", () => {
  it("skips rows with missing or invalid coordinates and keeps row indexes", () => {
    const rows = [
      { lat: "47.49", lng: "19.04" },
      { lat: null, lng: 19 },
      { lat: 47, lng: "x" },
      { lat: 120, lng: 19 },
      { lat: 47.53, lng: 21.62 },
    ];
    expect(extractLatLngPoints(rows, "lat", "lng")).toEqual([
      { lat: 47.49, lng: 19.04, rowIndex: 0 },
      { lat: 47.53, lng: 21.62, rowIndex: 4 },
    ]);
  });
  it("returns nothing when a coordinate field is not configured", () => {
    expect(extractLatLngPoints([{ lat: 1, lng: 1 }], null, "lng")).toEqual([]);
  });
});

describe("buildMapProjection", () => {
  it("fits the Hungary outline and places Budapest inside the viewport", () => {
    const fitted = buildMapProjection(topology, 600, 400);
    expect(fitted?.outline).toMatch(/^M/);
    const xy = projectPoint(fitted!.projection, { lat: 47.4979, lng: 19.0402 })!;
    expect(xy[0]).toBeGreaterThan(0);
    expect(xy[0]).toBeLessThan(600);
    expect(xy[1]).toBeGreaterThan(0);
    expect(xy[1]).toBeLessThan(400);
  });
  it("returns null for an empty viewport or missing country object", () => {
    expect(buildMapProjection(topology, 0, 400)).toBeNull();
    expect(buildMapProjection({ ...topology, objects: {} } as unknown as MapTopology, 600, 400)).toBeNull();
  });
});
