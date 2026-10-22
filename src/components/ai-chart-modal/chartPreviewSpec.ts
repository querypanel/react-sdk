import type { VizSpec } from "../VizSpecRenderer";
import { isVizSpec } from "../vizSpecGuard";

type Rows = Array<Record<string, unknown>>;

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
