import type { MapSpec } from "./VizSpecMap";

/** True for a VizSpec whose kind is `map`. Map specs are not charts: no chart type, axes or json-render element. */
export function isMapVizSpec(spec: unknown): spec is MapSpec {
  return Boolean(spec) && typeof spec === "object" && (spec as { kind?: unknown }).kind === "map";
}

/** The map's country code as stored in the spec (trimmed), or undefined when not a map or none is set. */
export function mapCountryOf(spec: unknown): string | undefined {
  if (!isMapVizSpec(spec)) return undefined;
  const country = spec.encoding?.country;
  return typeof country === "string" && country.trim() ? country.trim() : undefined;
}

/**
 * The map spec with another country (ISO 3166-1 alpha-2, upper-cased), or null when `spec` is not a
 * map or `country` is not a two-letter code. The map re-resolves its places and outline from the spec.
 */
export function withMapCountry(spec: unknown, country: string): Record<string, unknown> | null {
  const code = country.trim().toUpperCase();
  if (!isMapVizSpec(spec) || !/^[A-Z]{2}$/.test(code)) return null;
  return { ...spec, encoding: { ...spec.encoding, country: code } };
}
