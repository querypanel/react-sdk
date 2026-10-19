import type { VizSpec } from "../VizSpecRenderer";
import { isVizSpec } from "../vizSpecGuard";

type Rows = Array<Record<string, unknown>>;

/** Fill an empty spec's data from query result rows (works for VizSpec and legacy `data.values` specs). */
export function withVizSpecDataFallback(chartSpec: unknown, rows: Rows | null) {
  if (!rows || rows.length === 0) return chartSpec;

  try {
    const spec =
      typeof chartSpec === "string"
        ? (JSON.parse(chartSpec) as unknown)
        : chartSpec;
    if (!spec || typeof spec !== "object") return chartSpec;

    const s = spec as Record<string, unknown>;
    if (s.kind === "chart") {
      const currentData = s.data;
      if (Array.isArray(currentData) && currentData.length > 0) return s;
      return { ...s, data: rows };
    }

    const data = s.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const values = (data as { values?: unknown }).values;
      if (Array.isArray(values) && values.length > 0) return s;
      return { ...s, data: { ...(data as Record<string, unknown>), values: rows } };
    }

    return { ...s, data: { values: rows } };
  } catch {
    return chartSpec;
  }
}

export type VizSpecPreviewModel =
  | { ok: true; spec: VizSpec; data: Rows }
  | { ok: false; error: string };

/**
 * Same parsing the Chart block does (JSON string or object, VizSpec only, embedded
 * `data` first) so chat previews and Dashboard blocks render the same spec identically.
 */
export function resolveVizSpecPreview(
  chartSpec: unknown,
  fallbackRows: Rows | null,
): VizSpecPreviewModel {
  let raw: unknown = chartSpec;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Invalid chart specification" };
    }
  }
  if (!isVizSpec(raw)) return { ok: false, error: "Unsupported chart specification" };

  const embedded = (raw as { data?: unknown }).data;
  const data =
    Array.isArray(embedded) && embedded.length > 0
      ? (embedded as Rows)
      : (fallbackRows ?? []);
  return { ok: true, spec: raw, data };
}
