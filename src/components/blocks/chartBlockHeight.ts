export const DEFAULT_CHART_HEIGHT = 400;
export const DEFAULT_METRIC_HEIGHT = 120;
/** Maps need more room than the default chart to show a country legibly. */
export const DEFAULT_MAP_HEIGHT = 520;

export function parseBlockHeight(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Metrics use a compact default and maps a tall one; explicit non-default heights are kept. */
export function resolveChartBlockHeight(raw: unknown, kind?: string): number {
  const parsed = parseBlockHeight(raw);
  if (kind === "metric" && (parsed == null || parsed === DEFAULT_CHART_HEIGHT)) {
    return DEFAULT_METRIC_HEIGHT;
  }
  if (kind === "map" && (parsed == null || parsed === DEFAULT_CHART_HEIGHT)) {
    return DEFAULT_MAP_HEIGHT;
  }
  return parsed ?? DEFAULT_CHART_HEIGHT;
}
