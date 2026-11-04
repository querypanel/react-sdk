import { describe, expect, it } from "vitest";
import hungary from "./fixtures/hungary.topo.json";
import {
  buildMapProjection,
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
