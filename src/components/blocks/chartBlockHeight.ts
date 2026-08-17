export const DEFAULT_CHART_HEIGHT = 400;
export const DEFAULT_METRIC_HEIGHT = 120;

export function parseBlockHeight(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Metrics use a compact default; explicit non-default heights are kept. */
export function resolveChartBlockHeight(raw: unknown, kind?: string): number {
  const parsed = parseBlockHeight(raw);
  if (kind === "metric" && (parsed == null || parsed === DEFAULT_CHART_HEIGHT)) {
    return DEFAULT_METRIC_HEIGHT;
  }
  return parsed ?? DEFAULT_CHART_HEIGHT;
}
