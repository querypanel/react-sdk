"use client";

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

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
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

  return null;
}

function getElementsRecord(spec: JsonRenderSpec) {
  return spec.elements &&
    typeof spec.elements === "object" &&
    !Array.isArray(spec.elements)
    ? (spec.elements as Record<string, JsonRenderElement>)
    : null;
}

function getRootElement(spec: JsonRenderSpec) {
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
const LABEL_KEYS = ["label", "name", "category", "type", "group", "status"];

function findValueKey(keys: string[], sampleRow: Record<string, unknown>) {
  for (const key of VALUE_KEYS) {
    if (keys.includes(key) && toChartNumber(sampleRow[key]) !== null) return key;
  }

  for (const key of keys) {
    if (toChartNumber(sampleRow[key]) !== null) return key;
  }

  return null;
}

function findLabelKey(
  keys: string[],
  sampleRow: Record<string, unknown>,
  valueKey: string | null
) {
  for (const key of LABEL_KEYS) {
    if (key !== valueKey && keys.includes(key)) return key;
  }

  for (const key of keys) {
    if (key !== valueKey && toChartLabel(sampleRow[key]) !== null) return key;
  }

  return null;
}

export function normalizeRowsForJsonRenderChart(
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) return [];

  if (rows.length === 1) {
    const wide = normalizeWideSingleRow(rows[0] ?? {});
    if (wide.length > 0) {
      return wide;
    }
  }

  const keys = Object.keys(rows[0] ?? {});
  const valueKey = findValueKey(keys, rows[0] ?? {});
  const labelKey = findLabelKey(keys, rows[0] ?? {}, valueKey);

  return rows
    .map((point, index) => {
      const value = valueKey ? toChartNumber(point[valueKey]) : null;
      const label = labelKey
        ? (toChartLabel(point[labelKey]) ?? `Item ${index + 1}`)
        : `Item ${index + 1}`;

      return value === null ? null : { label, value };
    })
    .filter(
      (point): point is { label: string; value: number } => point !== null
    );
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
    return Array.isArray(props.data) && props.data.length > 0;
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

export function injectRowsIntoJsonRenderSpec(
  spec: unknown,
  rows: Array<Record<string, unknown>>,
  fields: string[]
) {
  const root = getRootElement((spec ?? {}) as JsonRenderSpec);
  if (!root || !root.element.props || typeof root.element.props !== "object") {
    return spec;
  }

  // Clone props so we can safely remove resultId when embedding data inline.
  // If `resultId` stays, some renderers will still attempt to fetch `/query-results/:id`
  // (which requires auth headers) even though we already hydrated the spec.
  const props = { ...(root.element.props as Record<string, unknown>) };
  delete props.resultId;
  const headers = fields.length > 0 ? fields : Object.keys(rows[0] ?? {});

  if (root.element.type === "DataTable") {
    return {
      ...(spec as Record<string, unknown>),
      elements: {
        ...root.elements,
        [root.rootId]: {
          ...root.element,
          props: {
            ...props,
            headers,
            rows: rows.map((row) => headers.map((field) => String(row[field] ?? ""))),
          },
        },
      },
    };
  }

  if (
    root.element.type === "BarChart" ||
    root.element.type === "LineChart" ||
    root.element.type === "PieChart"
  ) {
    return {
      ...(spec as Record<string, unknown>),
      elements: {
        ...root.elements,
        [root.rootId]: {
          ...root.element,
          props: {
            ...props,
            data: normalizeRowsForJsonRenderChart(rows),
          },
        },
      },
    };
  }

  if (root.element.type === "Metric") {
    const firstRow = rows[0] ?? {};
    const firstEntry =
      Object.entries(firstRow).find(([, value]) => toChartNumber(value) !== null) ??
      Object.entries(firstRow)[0];

    return {
      ...(spec as Record<string, unknown>),
      elements: {
        ...root.elements,
        [root.rootId]: {
          ...root.element,
          props: {
            ...props,
            label:
              typeof props.label === "string" && props.label.trim()
                ? props.label
                : (firstEntry?.[0] ?? "Value"),
            value: firstEntry ? String(firstEntry[1] ?? "") : "",
          },
        },
      },
    };
  }

  return spec;
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
