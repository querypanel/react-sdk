import { describe, expect, it } from "vitest";
import { resolveVizSpecPreview } from "./chartPreviewSpec";

const rows = [{ month: "Jan", revenue: 10 }];

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
