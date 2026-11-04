import { describe, expect, it } from "vitest";
import { distinctPlaces } from "./vizSpecMapPlaces";

// The package has no DOM test environment (vitest runs in node, no jsdom / @testing-library/react), so the
// component's effect behaviour is covered at the pure level: VizSpecMap resolves places once per
// JSON.stringify([country, places]) key, which must not change when only the `data` identity changes.
describe("place resolution key", () => {
  const fields = { postalCodeField: "zip", cityField: "city" };
  const rows = [
    { zip: "1011", city: "Budapest" },
    { zip: "1011", city: "Budapest" },
    { zip: null, city: "Szeged" },
  ];
  const key = (data: typeof rows) => JSON.stringify(["HU", distinctPlaces(data, fields).places]);

  it("is identical for a new data array with the same places", () => {
    expect(key(rows.map((r) => ({ ...r })))).toBe(key(rows));
  });
  it("changes when the distinct places change", () => {
    expect(key([...rows, { zip: "6720", city: "Szeged" }])).not.toBe(key(rows));
  });
  it("ignores duplicate rows (one entry per distinct place)", () => {
    expect(distinctPlaces(rows, fields).places).toHaveLength(2);
  });
});
