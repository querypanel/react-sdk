import { describe, expect, it } from "vitest";
import { describeRow, distinctPlaces, placeRows } from "./vizSpecMapPlaces";

const fields = { postalCodeField: "zip", cityField: "city" };
const rows = [
  { id: "a", zip: "7133", city: "Fadd" },
  { id: "b", zip: "7133", city: "Fadd" },
  { id: "c", zip: null, city: "Szeged" },
  { id: "d", zip: "", city: "" },
  { id: "e", zip: null, city: "Cloud" },
];

describe("distinctPlaces", () => {
  it("collapses duplicate places and flags rows with no location", () => {
    const { places, rowPlace } = distinctPlaces(rows, fields);
    expect(places).toEqual([
      { postalCode: "7133", city: "Fadd" },
      { postalCode: null, city: "Szeged" },
      { postalCode: null, city: "Cloud" },
    ]);
    expect(rowPlace).toEqual([0, 0, 1, -1, 2]);
  });
});

describe("placeRows", () => {
  it("groups rows by resolved point and lists unplaced rows", () => {
    const { rowPlace } = distinctPlaces(rows, fields);
    const fadd = { lat: 46.46, lng: 18.82, resolvedName: "Fadd", matchedBy: "postal" as const };
    const szeged = { lat: 46.25, lng: 20.14, resolvedName: "Szeged", matchedBy: "city" as const };
    const { points, unplacedRows } = placeRows(rowPlace, [fadd, szeged, null]);
    expect(points).toEqual([
      { lat: 46.46, lng: 18.82, resolvedName: "Fadd", rowIndexes: [0, 1] },
      { lat: 46.25, lng: 20.14, resolvedName: "Szeged", rowIndexes: [2] },
    ]);
    expect(unplacedRows).toEqual([3, 4]);
  });
});

describe("describeRow", () => {
  it("prefers the label, then the location text", () => {
    expect(describeRow(rows[4]!, { ...fields, labelField: "id" })).toBe("e");
    expect(describeRow(rows[4]!, { ...fields, labelField: null })).toBe("Cloud");
  });
});
