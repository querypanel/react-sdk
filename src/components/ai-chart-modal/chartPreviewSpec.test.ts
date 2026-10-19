import { describe, expect, it } from "vitest";
import {
  resolveVizSpecPreview,
  withVizSpecDataFallback,
} from "./chartPreviewSpec";

const rows = [{ month: "Jan", revenue: 10 }];

describe("withVizSpecDataFallback", () => {
  it("returns the spec untouched when there are no rows", () => {
    const spec = { kind: "chart", data: [] };
    expect(withVizSpecDataFallback(spec, null)).toBe(spec);
    expect(withVizSpecDataFallback(spec, [])).toBe(spec);
  });

  it("fills empty VizSpec data and keeps existing data", () => {
    expect(withVizSpecDataFallback({ kind: "chart", data: [] }, rows)).toEqual({
      kind: "chart",
      data: rows,
    });
    const filled = { kind: "chart", data: [{ a: 1 }] };
    expect(withVizSpecDataFallback(filled, rows)).toBe(filled);
  });

  it("fills legacy data.values specs", () => {
    expect(withVizSpecDataFallback({ mark: "bar", data: { values: [] } }, rows)).toEqual({
      mark: "bar",
      data: { values: rows },
    });
  });
});

describe("resolveVizSpecPreview", () => {
  it("prefers embedded data over fallback rows", () => {
    const result = resolveVizSpecPreview({ kind: "chart", data: [{ a: 1 }] }, rows);
    expect(result).toMatchObject({ ok: true, data: [{ a: 1 }] });
  });

  it("uses fallback rows when the spec has no data", () => {
    const result = resolveVizSpecPreview(JSON.stringify({ kind: "table" }), rows);
    expect(result).toMatchObject({ ok: true, data: rows });
  });

  it("falls back to an empty array without rows", () => {
    expect(resolveVizSpecPreview({ kind: "metric" }, null)).toMatchObject({ ok: true, data: [] });
  });

  it("rejects non-VizSpec and unparsable specs", () => {
    expect(resolveVizSpecPreview({ mark: "bar" }, rows)).toEqual({
      ok: false,
      error: "Unsupported chart specification",
    });
    expect(resolveVizSpecPreview("{nope", rows).ok).toBe(false);
    expect(resolveVizSpecPreview(undefined, rows).ok).toBe(false);
  });
});
