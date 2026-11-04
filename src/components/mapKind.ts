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

/**
 * The map spec with another country (ISO 3166-1 alpha-2, upper-cased), or null when `spec` is not a
 * map or `country` is not a two-letter code. The map re-resolves its places and outline from the spec.
 */
export function withMapCountry(spec: unknown, country: string): Record<string, unknown> | null {
  const code = country.trim().toUpperCase();
  if (!isMapVizSpec(spec) || !/^[A-Z]{2}$/.test(code)) return null;
  const mapSpec = spec as { encoding?: Record<string, unknown> };
  return { ...mapSpec, encoding: { ...mapSpec.encoding, country: code } };
}
