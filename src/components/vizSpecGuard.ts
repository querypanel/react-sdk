import { isMapVizSpec } from "./mapKind";
import type { VizSpec } from "./VizSpecRenderer";

/** Every VizSpec kind; the single list the union type and the guards derive from. */
export const VIZ_KINDS = ["chart", "table", "metric", "map"] as const;
export type VizSpecKind = (typeof VIZ_KINDS)[number];

export function isVizSpecKind(value: unknown): value is VizSpecKind {
  return (VIZ_KINDS as readonly unknown[]).includes(value);
}

export function isVizSpec(value: unknown): value is VizSpec {
  if (!value || typeof value !== "object") return false;
  return isVizSpecKind((value as { kind?: unknown }).kind);
}

/** Block title for a spec that has none: its title, else its description, else "Map" / "Chart". */
export function defaultBlockTitle(spec: unknown): string {
  const { title, description } = (spec ?? {}) as { title?: string; description?: string };
  return title?.trim() || description || (isMapVizSpec(spec) ? "Map" : "Chart");
}
