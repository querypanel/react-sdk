import type { ChartType, SqlModifications, VizModifications } from "../../types";

export type PinnedChartModifyRequest = {
  sql: string;
  question: string;
  params?: Record<string, unknown>;
  datasourceIds: string[];
  dashboardId?: string;
  tenantFieldName?: string;
  previewTenantId?: string;
  sqlModifications?: SqlModifications;
  vizModifications?: VizModifications;
};

export type PinnedChartModifyResponse = {
  success?: boolean;
  error?: string;
  sql?: string;
  params?: Record<string, unknown>;
  rationale?: string;
  rows?: Array<Record<string, unknown>>;
  fields?: string[];
  chart?: {
    vizSpec?: unknown;
    vegaLiteSpec?: unknown;
    specType?: string;
  };
  chartSpec?: unknown;
  modified?: {
    sqlChanged: boolean;
    vizChanged: boolean;
  };
};

export async function callPinnedChartModify(
  url: string,
  body: PinnedChartModifyRequest,
  headers: Record<string, string>,
  organizationId?: string
): Promise<PinnedChartModifyResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const parsed = (await response.json().catch(() => ({}))) as PinnedChartModifyResponse;
  if (!response.ok) {
    throw new Error(parsed?.error || "Failed to modify chart");
  }
  return parsed;
}

export function chartTypeFromVizSpec(spec: unknown): ChartType | "" {
  if (!spec || typeof spec !== "object") return "";
  const encoding = (spec as { encoding?: { chartType?: unknown } }).encoding;
  const chartType = encoding?.chartType;
  if (
    chartType === "bar" ||
    chartType === "column" ||
    chartType === "line" ||
    chartType === "area" ||
    chartType === "scatter" ||
    chartType === "pie"
  ) {
    return chartType;
  }
  return "";
}

/** Map VizSpec chart types onto json-render chart element types. */
export function jsonRenderTypeForChartType(
  chartType: ChartType
): "BarChart" | "LineChart" | "PieChart" | null {
  switch (chartType) {
    case "bar":
    case "column":
      return "BarChart";
    case "line":
    case "area":
      return "LineChart";
    case "pie":
      return "PieChart";
    case "scatter":
      return null;
    default: {
      const _exhaustive: never = chartType;
      void _exhaustive;
      return null;
    }
  }
}

export function swapJsonRenderChartType(
  spec: unknown,
  chartType: ChartType
): unknown | null {
  const nextType = jsonRenderTypeForChartType(chartType);
  if (!nextType || !spec || typeof spec !== "object") return null;

  const clone = structuredClone(spec) as {
    root?: { element?: { type?: string; props?: Record<string, unknown> } };
    element?: { type?: string };
  };

  if (clone.root?.element?.type) {
    clone.root.element.type = nextType;
    return clone;
  }
  if (clone.element?.type) {
    clone.element.type = nextType;
    return clone;
  }
  return null;
}
