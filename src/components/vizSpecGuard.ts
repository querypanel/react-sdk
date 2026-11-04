import type { VizSpec } from "./VizSpecRenderer";

export function isVizSpec(value: unknown): value is VizSpec {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "chart" || kind === "table" || kind === "metric" || kind === "map";
}
