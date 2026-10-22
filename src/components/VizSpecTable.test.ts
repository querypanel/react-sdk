import { describe, expect, it } from "vitest";
import { toDisplayRows } from "./VizSpecTable";

describe("toDisplayRows", () => {
  it("re-keys rows by column label so the table finds each cell", () => {
    const rows = [{ status: "active", subscription_count: "9" }];
    const columns = [
      { field: "status", label: "Status" },
      { field: "subscription_count", label: "Signups" },
    ];
    expect(toDisplayRows(rows, columns)).toEqual([{ Status: "active", Signups: "9" }]);
  });

  it("falls back to the field name when a column has no label", () => {
    expect(toDisplayRows([{ a: 1, b: 2 }], [{ field: "a" }, { field: "b", label: null }])).toEqual([{ a: 1, b: 2 }]);
  });

  it("leaves missing fields undefined instead of dropping the column", () => {
    expect(toDisplayRows([{ a: 1 }], [{ field: "a", label: "A" }, { field: "z", label: "Z" }])).toEqual([
      { A: 1, Z: undefined },
    ]);
  });
});
