import type { ChartType } from "../types";

/** True for a VizSpec whose kind is `map`. Map specs are not charts: no chart type, axes or json-render element. */
export function isMapVizSpec(spec: unknown): boolean {
  return Boolean(spec) && typeof spec === "object" && (spec as { kind?: unknown }).kind === "map";
}

/**
 * Chart types a type picker may offer for this spec. Maps cannot switch to another chart type
 * (and the reverse), so the list is empty and pickers hide the chart-type choice.
 * `undefined` means "no restriction" (caller's own default list).
 */
export function chartTypesForSpec(spec: unknown, allowed?: ChartType[]): ChartType[] | undefined {
  return isMapVizSpec(spec) ? [] : allowed;
}

export const MAP_NOT_SUPPORTED_MESSAGE = "Map charts aren't supported in this view yet.";
