type JsonRenderElement = {
  type?: unknown;
  props?: unknown;
  children?: unknown;
};

type JsonRenderSpec = {
  root?: unknown;
  elements?: unknown;
};

function toChartNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Zero-padded codes ("05", "007") are identifiers, not measures.
    if (/^[+-]?0\d/.test(trimmed)) return null;
    const parsed = Number(trimmed.replace(/,/g, "").replace(/[$%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toChartLabel(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return null;
}

function getElementsRecord(spec: JsonRenderSpec) {
  return spec.elements &&
    typeof spec.elements === "object" &&
    !Array.isArray(spec.elements)
    ? (spec.elements as Record<string, JsonRenderElement>)
    : null;
}

export function getRootElement(spec: JsonRenderSpec) {
  if (typeof spec.root !== "string") return null;
  const elements = getElementsRecord(spec);
  if (!elements) return null;
  const rootElement = elements[spec.root];
  if (!rootElement || typeof rootElement !== "object") return null;
  return {
    rootId: spec.root,
    element: rootElement,
    elements,
  };
}

function normalizeWideSingleRow(
  row: Record<string, unknown>
): Array<{ label: string; value: number }> {
  const numericEntries = Object.entries(row)
    .map(([key, value]) => {
      const numericValue = toChartNumber(value);
      return numericValue === null ? null : { label: key, value: numericValue };
    })
    .filter(
      (entry): entry is { label: string; value: number } => entry !== null
    );

  return numericEntries.length >= 2 ? numericEntries : [];
}

const VALUE_KEYS = ["value", "count", "total", "amount", "metric", "number"];
const LABEL_KEYS = ["label", "name", "category", "type", "group", "status", "state"];
const MEASURE_NAME_RE =
  /(^|_)(count|total|amount|usage|metric|sum|avg|average|number)(_|$)/i;
const IDENTITY_NAME_RE = /(^|_)(id|uuid|tenant_id|user_id|org_id|state)(_|$)/i;

export type JsonRenderChartFieldHints = {
  labelField?: string | null;
  valueField?: string | null;
  /** Column that splits a line chart into one line per distinct value. */
  seriesField?: string | null;
};

export type ChartPoint = { label: string; value: number; series?: string };

function isChartDataPoint(row: Record<string, unknown>) {
  return (
    "label" in row &&
    "value" in row &&
    toChartLabel(row.label) !== null &&
    toChartNumber(row.value) !== null
  );
}

function isPreformattedChartData(rows: Array<Record<string, unknown>>) {
  return rows.length > 0 && rows.every(isChartDataPoint);
}

function columnMaxMagnitude(rows: Array<Record<string, unknown>>, key: string) {
  let max = 0;
  for (const row of rows) {
    const numeric = toChartNumber(row[key]);
    if (numeric === null) continue;
    const magnitude = Math.abs(numeric);
    if (magnitude > max) max = magnitude;
  }
  return max;
}

function isMeasureLikeKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return VALUE_KEYS.includes(normalized) || MEASURE_NAME_RE.test(normalized);
}

function isIdentityLikeKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return LABEL_KEYS.includes(normalized) || IDENTITY_NAME_RE.test(normalized);
}

function findValueKey(
  keys: string[],
  rows: Array<Record<string, unknown>>,
  sampleRow: Record<string, unknown>
) {
  const numericKeys = keys.filter((key) => toChartNumber(sampleRow[key]) !== null);
  if (numericKeys.length === 0) return null;
  if (numericKeys.length === 1) return numericKeys[0];

  for (const key of VALUE_KEYS) {
    if (numericKeys.includes(key)) return key;
  }

  const measureLikeKeys = numericKeys.filter((key) => isMeasureLikeKey(key));
  if (measureLikeKeys.length === 1) {
    return measureLikeKeys[0]!;
  }
  if (measureLikeKeys.length > 1) {
    let bestKey = measureLikeKeys[0]!;
    let bestMax = columnMaxMagnitude(rows, bestKey);
    for (const key of measureLikeKeys.slice(1)) {
      const max = columnMaxMagnitude(rows, key);
      if (max > bestMax) {
        bestKey = key;
        bestMax = max;
      }
    }
    return bestKey;
  }

  // Prefer non-identity numeric columns over ids (e.g. chart_count over tenant_id).
  const nonIdentityKeys = numericKeys.filter((key) => !isIdentityLikeKey(key));
  const candidates = nonIdentityKeys.length > 0 ? nonIdentityKeys : numericKeys;

  let bestKey = candidates[0]!;
  let bestMax = columnMaxMagnitude(rows, bestKey);
  for (const key of candidates.slice(1)) {
    const max = columnMaxMagnitude(rows, key);
    if (max > bestMax) {
      bestKey = key;
      bestMax = max;
    }
  }
  return bestKey;
}

function findLabelKey(
  keys: string[],
  sampleRow: Record<string, unknown>,
  valueKey: string | null
) {
  for (const key of keys) {
    if (key === valueKey) continue;
    if (toChartNumber(sampleRow[key]) !== null) continue;
    if (toChartLabel(sampleRow[key]) !== null) return key;
  }

  for (const key of LABEL_KEYS) {
    if (key !== valueKey && keys.includes(key)) return key;
  }

  // Prefer identity-like numeric columns (tenant_id) as labels over leftover measures.
  for (const key of keys) {
    if (key === valueKey) continue;
    if (!isIdentityLikeKey(key)) continue;
    if (toChartLabel(sampleRow[key]) !== null) return key;
  }

  for (const key of keys) {
    if (key !== valueKey && toChartLabel(sampleRow[key]) !== null) return key;
  }

  return null;
}

export function resolveChartFieldHints(
  fields: string[],
  hints?: JsonRenderChartFieldHints
) {
  const pick = (field?: string | null) => {
    const trimmed = field?.trim() || null;
    return trimmed && fields.includes(trimmed) ? trimmed : null;
  };
  const labelField = pick(hints?.labelField);
  const valueField = pick(hints?.valueField);
  const seriesField = pick(hints?.seriesField);

  return {
    labelField,
    valueField,
    // A series column that doubles as the label or value would draw nonsense.
    seriesField:
      seriesField && seriesField !== labelField && seriesField !== valueField
        ? seriesField
        : null,
  };
}

export function normalizeRowsForJsonRenderChart(
  rows: Array<Record<string, unknown>>,
  hints?: JsonRenderChartFieldHints
): ChartPoint[] {
  if (rows.length === 0) return [];

  if (isPreformattedChartData(rows)) {
    return rows
      .map((point) => {
        const series = toChartLabel(point.series);
        return {
          label: toChartLabel(point.label) ?? "",
          value: toChartNumber(point.value) ?? 0,
          ...(series ? { series } : {}),
        };
      })
      .filter((point) => point.label.length > 0);
  }

  if (rows.length === 1) {
    const wide = normalizeWideSingleRow(rows[0] ?? {});
    if (wide.length > 0) {
      return wide;
    }
  }

  const keys = Object.keys(rows[0] ?? {});
  const { labelField, valueField, seriesField } = resolveChartFieldHints(
    keys,
    hints
  );

  if (labelField && valueField) {
    const mapped = rows
      .map((point, index): ChartPoint | null => {
        const value = toChartNumber(point[valueField]);
        if (value === null) return null;
        const series = seriesField ? toChartLabel(point[seriesField]) : null;
        return {
          label: toChartLabel(point[labelField]) ?? `Item ${index + 1}`,
          value,
          ...(series ? { series } : {}),
        };
      })
      .filter((point): point is ChartPoint => point !== null);
    if (mapped.length > 0) {
      return mapped;
    }
    // Fall through to auto-detect when VizSpec field names don't match the rows.
  }

  const sampleRow = rows[0] ?? {};
  // A lone hint still wins over guessing for that axis.
  const valueKey = valueField ?? findValueKey(keys, rows, sampleRow);
  const labelKey =
    labelField && labelField !== valueKey
      ? labelField
      : findLabelKey(keys, sampleRow, valueKey);

  return rows
    .map((point, index) => {
      const value = valueKey ? toChartNumber(point[valueKey]) : null;
      const label = labelKey
        ? (toChartLabel(point[labelKey]) ?? `Item ${index + 1}`)
        : `Item ${index + 1}`;

      return value === null ? null : { label, value };
    })
    .filter((point): point is ChartPoint => point !== null);
}

const MAX_SERIES = 12;

export type PivotedSeries = {
  /** One row per label; `s0`, `s1`, ... hold each series' value, absent when missing. */
  rows: Array<Record<string, string | number>>;
  series: Array<{ key: string; name: string }>;
  /** Series dropped because there were more than `maxSeries` (smallest totals go first). */
  droppedSeries: number;
};

/**
 * Pivot long points ({label, series, value}) into wide rows keyed by label with one
 * key per series. Returns null for single-series data so callers keep the old path.
 * Missing label/series combinations stay absent (a gap), never zero.
 */
export function pivotSeriesPoints(
  points: ChartPoint[],
  maxSeries = MAX_SERIES
): PivotedSeries | null {
  if (!points.some((point) => point.series)) return null;

  const totals = new Map<string, number>();
  for (const point of points) {
    const name = point.series ?? "";
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(point.value));
  }
  const names = [...totals.keys()];
  const kept = new Set(
    [...names].sort((a, b) => totals.get(b)! - totals.get(a)!).slice(0, maxSeries)
  );
  // Keep first-appearance order so colours stay stable between renders.
  const series = names
    .filter((name) => kept.has(name))
    .map((name, index) => ({ key: `s${index}`, name }));
  const keyByName = new Map(series.map((entry) => [entry.name, entry.key]));

  const byLabel = new Map<string, Record<string, string | number>>();
  for (const point of points) {
    const key = keyByName.get(point.series ?? "");
    if (!key) continue;
    const row = byLabel.get(point.label) ?? { label: point.label };
    row[key] = point.value;
    byLabel.set(point.label, row);
  }

  let rows = [...byLabel.values()];
  const labels = rows.map((row) => String(row.label));
  if (labels.every((label) => !Number.isNaN(Date.parse(label)))) {
    // Series that start late would otherwise push their weeks to the end.
    rows = rows.sort(
      (a, b) => Date.parse(String(a.label)) - Date.parse(String(b.label))
    );
  }

  return { rows, series, droppedSeries: names.length - series.length };
}

function resolvePersistedChartFieldHints(
  props: Record<string, unknown>,
  fields: string[]
) {
  const explicit = resolveChartFieldHints(fields, chartHintsFromProps(props));
  if (explicit.labelField && explicit.valueField) {
    return explicit;
  }

  const xLabel =
    typeof props.xLabel === "string" ? props.xLabel.trim() : null;
  const yLabel =
    typeof props.yLabel === "string" ? props.yLabel.trim() : null;

  return resolveChartFieldHints(fields, {
    labelField: explicit.labelField ?? (xLabel && fields.includes(xLabel) ? xLabel : null),
    valueField: explicit.valueField ?? (yLabel && fields.includes(yLabel) ? yLabel : null),
    seriesField: explicit.seriesField,
  });
}

/** Field hints a persisted chart element carries in its props. */
export function chartHintsFromProps(
  props: Record<string, unknown>
): JsonRenderChartFieldHints {
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    labelField: str(props.labelField),
    valueField: str(props.valueField),
    seriesField: str(props.seriesField),
  };
}

export function isJsonRenderSpecLike(spec: unknown): spec is JsonRenderSpec {
  return Boolean(getRootElement((spec ?? {}) as JsonRenderSpec));
}

export function getJsonRenderPresentationKind(
  spec: unknown
): "chart" | "table" | "metric" | null {
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || typeof root.element.type !== "string") return null;

  if (root.element.type === "DataTable") return "table";
  if (root.element.type === "Metric") return "metric";
  if (
    root.element.type === "BarChart" ||
    root.element.type === "LineChart" ||
    root.element.type === "PieChart"
  ) {
    return "chart";
  }

  return null;
}

export function getJsonRenderTitle(spec: unknown) {
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || !root.element.props || typeof root.element.props !== "object") {
    return undefined;
  }

  const props = root.element.props as Record<string, unknown>;
  if (typeof props.title === "string" && props.title.trim()) return props.title.trim();
  if (typeof props.caption === "string" && props.caption.trim()) return props.caption.trim();
  if (typeof props.label === "string" && props.label.trim()) return props.label.trim();
  return undefined;
}

export function hasInlineJsonRenderData(spec: unknown) {
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || !root.element.props || typeof root.element.props !== "object") {
    return false;
  }

  const props = root.element.props as Record<string, unknown>;
  if (root.element.type === "DataTable") {
    return Array.isArray(props.rows) && props.rows.length > 0;
  }

  if (
    root.element.type === "BarChart" ||
    root.element.type === "LineChart" ||
    root.element.type === "PieChart"
  ) {
    if (!Array.isArray(props.data)) return false;
    return normalizeRowsForJsonRenderChart(
      props.data as Array<Record<string, unknown>>,
      chartHintsFromProps(props),
    ).length > 0;
  }

  if (root.element.type === "Metric") {
    return typeof props.value === "string" && props.value.trim().length > 0;
  }

  return false;
}

export function withJsonRenderResultId(spec: unknown, resultId?: string | null) {
  if (!resultId) return spec;
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || !root.element.props || typeof root.element.props !== "object") {
    return spec;
  }

  const props = root.element.props as Record<string, unknown>;
  if (
    root.element.type !== "DataTable" &&
    root.element.type !== "BarChart" &&
    root.element.type !== "LineChart" &&
    root.element.type !== "PieChart"
  ) {
    return spec;
  }

  if (typeof props.resultId === "string" && props.resultId.trim()) {
    return spec;
  }

  return {
    ...(spec as Record<string, unknown>),
    elements: {
      ...root.elements,
      [root.rootId]: {
        ...root.element,
        props: {
          ...props,
          resultId,
        },
      },
    },
  };
}

export type InjectRowsOptions = {
  /**
   * When true (pinned modify), always use the incoming rows — including empty —
   * instead of preserving prior series when remap yields nothing.
   */
  replaceExisting?: boolean;
};

export function injectRowsIntoJsonRenderSpec(
  spec: unknown,
  rows: Array<Record<string, unknown>>,
  fields: string[],
  options?: InjectRowsOptions
) {
  const replaceExisting = options?.replaceExisting === true;
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || !root.element.props || typeof root.element.props !== "object") {
    return spec;
  }

  const props = root.element.props as Record<string, unknown>;
  const headers = fields.length > 0 ? fields : Object.keys(rows[0] ?? {});

  // Drop resultId only where data actually ends up inline; hosts may disable artifact
  // fetch, but a failed remap must not also lose the fetch fallback.
  const inlined = ({ resultId: _dropped, ...rest }: Record<string, unknown>) => rest;
  const withProps = (nextProps: Record<string, unknown>) => ({
    ...(spec as Record<string, unknown>),
    elements: {
      ...root.elements,
      [root.rootId]: { ...root.element, props: nextProps },
    },
  });

  if (root.element.type === "DataTable") {
    const nextRows = rows.map((row) => headers.map((field) => String(row[field] ?? "")));
    if (nextRows.length === 0 && !replaceExisting) return spec;
    return withProps({ ...inlined(props), headers, rows: nextRows });
  }

  if (
    root.element.type === "BarChart" ||
    root.element.type === "LineChart" ||
    root.element.type === "PieChart"
  ) {
    const fieldHints = resolvePersistedChartFieldHints(props, headers);
    const existingData = Array.isArray(props.data)
      ? (props.data as Array<Record<string, unknown>>)
      : [];
    const nextData = normalizeRowsForJsonRenderChart(rows, fieldHints);
    // Default: keep existing series if remap yields nothing (initial hydrate).
    // Modify path: replace so empty/new windows actually update the chart.
    const data = replaceExisting
      ? nextData
      : nextData.length > 0
        ? nextData
        : existingData;
    if (data.length === 0 && !replaceExisting) return spec;
    return withProps({ ...inlined(props), data });
  }

  if (root.element.type === "Metric") {
    const entries = Object.entries(rows[0] ?? {});
    const firstEntry =
      entries.find(([, value]) => toChartNumber(value) !== null) ?? entries[0];
    if (!firstEntry) return spec;
    return withProps({
      ...inlined(props),
      label:
        typeof props.label === "string" && props.label.trim() ? props.label : firstEntry[0],
      value: toChartLabel(firstEntry[1]) ?? "",
    });
  }

  return spec;
}

/** Inject SQL rows into a json-render spec when present; otherwise return spec unchanged. */
export function hydrateJsonRenderSpecFromRows(
  spec: unknown,
  rows: Array<Record<string, unknown>> | null | undefined,
  fields?: string[] | null,
) {
  if (!spec || !rows?.length) return spec;
  if (hasInlineJsonRenderData(spec)) return spec;
  return injectRowsIntoJsonRenderSpec(
    spec,
    rows,
    fields?.length ? fields : Object.keys(rows[0] ?? {}),
  );
}

export function stripDataFromJsonRenderSpec(spec: unknown) {
  const record = (spec ?? {}) as JsonRenderSpec;
  const elements = getElementsRecord(record);
  if (!elements) return spec;

  const nextElements = Object.fromEntries(
    Object.entries(elements).map(([id, element]) => {
      if (!element || typeof element !== "object") {
        return [id, element];
      }

      const props =
        element.props && typeof element.props === "object" && !Array.isArray(element.props)
          ? ({ ...(element.props as Record<string, unknown>) } as Record<string, unknown>)
          : null;

      if (!props) {
        return [id, element];
      }

      if (element.type === "DataTable") {
        delete props.rows;
        delete props.resultId;
      } else if (
        element.type === "BarChart" ||
        element.type === "LineChart" ||
        element.type === "PieChart"
      ) {
        delete props.data;
        delete props.resultId;
      } else if (element.type === "Metric") {
        delete props.value;
      }

      return [
        id,
        {
          ...element,
          props,
        },
      ];
    })
  );

  return {
    ...(spec as Record<string, unknown>),
    elements: nextElements,
  };
}
