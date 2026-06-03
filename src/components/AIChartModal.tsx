"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  XIcon,
  SendIcon,
  BarChart3Icon,
  SparklesIcon,
  Wand2Icon,
  CircleCheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  SlidersHorizontalIcon,
  ChevronUpIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DatasourceSelector } from "./DatasourceSelector";
import { PersistedSpecRenderer } from "./generative-ui/PersistedSpecRenderer";
import { createMastraChartChunkHandler } from "./ai-chart-modal/applyMastraChartChunk";
import {
  consumeMastraChartStream,
  formatToolStatus,
  MastraStreamTerminalError,
} from "./ai-chart-modal/mastraChartStream";
import type {
  MastraChartMessage,
  SqlExecutionArtifact,
  ToolEvent,
  ToolEventStatus,
} from "./ai-chart-modal/types";
import { formatTimestampForDisplay } from "../utils/formatters";
import "./AIChartModal.css";

/** Unique React list keys; `Date.now()` alone can collide (Strict Mode, same tick). */
function createMessageId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Option for the SQL / chart LLM model selector (OpenAI model id as `value`). */
export type AIChartModelOption = { value: string; label: string };

/** Sensible defaults; override via `chartModelOptions` if your deployment uses different ids. */
export const DEFAULT_AI_CHART_MODEL_OPTIONS: AIChartModelOption[] = [
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "", label: "Server default" },
];

export interface AIChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChart: (
    chartSpec: unknown,
    rationale?: string,
    sql?: string,
    datasourceIds?: string[],
    sqlParams?: Record<string, unknown> | null,
    tenantFieldName?: string,
    previewTenantId?: string,
    resultId?: string
  ) => void;
  organizationId: string;
  dashboardId: string;
  initialPrompt?: string;
  dashboardType?: "customer" | "internal";
  /** URL for SQL chart generation (default: /api/ai/generate-chart-with-sql) */
  generateChartWithSqlUrl?: string;
  /** URL for datasources (default: /api/datasources) */
  datasourcesUrl?: string;
  /** Extra headers for API requests (e.g. x-organization-id is always sent) */
  headers?: Record<string, string>;
  /** URL for result artifact fetches used by json-render previews */
  queryResultBaseUrl?: string;
  /** Whether to render dark theme styles for inline-styled children */
  darkMode?: boolean;
  /** When set, only these datasource IDs are shown (e.g. from dashboard.available_datasource_ids). */
  availableDatasourceIds?: string[] | null;
  /** Default tenant field name (e.g. from dashboard.tenant_field_name). */
  defaultTenantFieldName?: string | null;
  /** Per-datasource tenant field name (e.g. from dashboard.tenant_field_by_datasource). Overrides default for the selected datasource. */
  tenantFieldByDatasource?: Record<string, string> | null;
  /** When true, hide tenant field name and preview tenant ID inputs (e.g. in customer embed; tenant comes from JWT only). */
  hideTenantInputs?: boolean;
  /** Whitelabel: modal title (default: "AI Chart Generator") */
  title?: string;
  /** Whitelabel: empty-state heading (default: "Create a Visualization") */
  createTitle?: string;
  /** Model dropdown options (`value` = bare model id; empty string = server default). Server maps tiers when using Gemini. */
  chartModelOptions?: AIChartModelOption[];
  /** Initial selected model `value` when the modal opens (default: `gpt-5.4-mini`) */
  defaultChartModel?: string;
}

type Message = MastraChartMessage;

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
const EMPTY_HEADERS: Record<string, string> = {};
const GENERIC_ASSISTANT_SUMMARIES = new Set([
  "I've prepared a visualization for you.",
  "I've prepared a table for you.",
  "I processed your request.",
]);

function isMastraAgentStreamUrl(url: string) {
  return /\/api\/agents\/[^/]+\/stream(?:[/?#]|$)/.test(url);
}

const AI_CHART_MODAL_NARROW_QUERY = "(max-width: 52rem)";

function subscribeAiChartModalNarrow(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(AI_CHART_MODAL_NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getAiChartModalNarrowSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(AI_CHART_MODAL_NARROW_QUERY).matches;
}

function useAiChartModalNarrowLayout() {
  return useSyncExternalStore(
    subscribeAiChartModalNarrow,
    getAiChartModalNarrowSnapshot,
    () => false
  );
}

/**
 * Mastra stream expects AI Gateway–style `provider/model` (e.g. `openai/gpt-5.4-mini`, `google/gemini-3-flash-preview`).
 * Bare Gemini ids are prefixed with `google/` so the agent uses GOOGLE_GENERATIVE_AI_API_KEY when that provider is active.
 */
function normalizeModelForMastraStreamBody(model: string): string {
  const t = model.trim();
  if (!t) return "";
  if (t.includes("/")) return t;
  if (/^gemini/i.test(t)) return `google/${t}`;
  return `openai/${t}`;
}

function getLatestResultId(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    const resultId = message.resultId ?? message.queryResult?.resultId;
    if (typeof resultId === "string" && resultId.trim().length > 0) {
      return resultId.trim();
    }
  }

  return undefined;
}

const FOLLOW_UP_RESULT_REFERENCE =
  "(?:that|this|it|the above|the previous result|the previous results|the result|the results|same data)";

const FOLLOW_UP_VISUALIZATION_PATTERNS = [
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:turn|convert|make|render)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\s+(?:into|as)\\s+(?:a\\s+|an\\s+)?(?:bar|line|pie|column|area)?\\s*(?:chart|graph|table|visuali[sz]ation)\\b`,
    "i"
  ),
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:plot|chart|graph|visuali[sz]e|tabulate)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\b`,
    "i"
  ),
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:show|display)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\s+(?:as|in)\\s+(?:a\\s+|an\\s+)?(?:bar|line|pie|column|area)?\\s*(?:chart|graph|table|visuali[sz]ation)\\b`,
    "i"
  ),
  /^(?:a\s+|an\s+)?(?:bar|line|pie|column|area)\s+chart$/i,
  /^(?:show\s+as|make\s+it\s+a)\s+(?:bar|line|pie|column|area)\s+chart$/i,
  /^(?:show\s+as|make\s+it)\s+(?:a\s+)?table$/i,
];

function shouldReuseLatestResultId(prompt: string) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return false;
  return FOLLOW_UP_VISUALIZATION_PATTERNS.some((pattern) =>
    pattern.test(normalizedPrompt)
  );
}

function isNumericChartValue(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) return true;
  return false;
}

function formatTooltipValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return formatTimestampForDisplay(value);

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2,
    }).format(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "—";
    if (Number.isFinite(Number(normalized))) {
      return formatTooltipValue(Number(normalized));
    }
    return formatTimestampForDisplay(normalized);
  }

  return String(value);
}

function getTooltipStyles(darkMode: boolean, isNarrowChart: boolean) {
  const borderColor = darkMode ? "rgba(148, 163, 184, 0.28)" : "rgba(15, 23, 42, 0.08)";
  const backgroundColor = darkMode ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)";
  const textColor = darkMode ? "#e2e8f0" : "#0f172a";
  const mutedColor = darkMode ? "#94a3b8" : "#475569";

  return {
    contentStyle: {
      backgroundColor,
      border: `1px solid ${borderColor}`,
      borderRadius: isNarrowChart ? 12 : 10,
      boxShadow: darkMode
        ? "0 18px 48px rgba(2, 6, 23, 0.55)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)",
      color: textColor,
      fontSize: isNarrowChart ? 13 : 12,
      lineHeight: 1.45,
      padding: isNarrowChart ? "10px 12px" : "8px 10px",
    },
    itemStyle: {
      color: textColor,
      fontSize: isNarrowChart ? 13 : 12,
      padding: 0,
    },
    labelStyle: {
      color: mutedColor,
      fontSize: isNarrowChart ? 12 : 11,
      fontWeight: 600,
      marginBottom: 4,
    },
    cursor: {
      fill: darkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.16)",
    },
  } as const;
}

function getMessageRationale(message: Message) {
  const rationale = message.rationale?.trim();
  if (rationale) return rationale;

  const content = message.content.trim();
  if (!content || GENERIC_ASSISTANT_SUMMARIES.has(content)) {
    return undefined;
  }

  return content;
}

function withVizSpecDataFallback(
  chartSpec: unknown,
  rows: Array<Record<string, unknown>> | null
) {
  if (!rows || rows.length === 0) return chartSpec;

  try {
    const spec =
      typeof chartSpec === "string"
        ? (JSON.parse(chartSpec) as unknown)
        : chartSpec;
    if (!spec || typeof spec !== "object") return chartSpec;

    const s = spec as Record<string, unknown>;
    if (s.kind === "chart") {
      const currentData = s.data;
      if (Array.isArray(currentData) && currentData.length > 0) return s;
      return { ...s, data: rows };
    }

    const data = s.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const values = (data as { values?: unknown }).values;
      if (Array.isArray(values) && values.length > 0) return s;
      return { ...s, data: { ...(data as Record<string, unknown>), values: rows } };
    }

    return { ...s, data: { values: rows } };
  } catch {
    return chartSpec;
  }
}

function getToolEventLabel(toolName: string) {
  return formatToolStatus(toolName);
}

function ToolEventStatusIcon({ status }: { status: ToolEventStatus }) {
  if (status === "succeeded") return <CircleCheckIcon className="w-4 h-4" />;
  if (status === "failed") return <CircleAlertIcon className="w-4 h-4" />;
  return <LoaderCircleIcon className="w-4 h-4 qp-ai-modal-spin" />;
}

function ToolEventChip({
  event,
  active,
  onClick,
}: {
  event: ToolEvent;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`qp-ai-modal-toolchip ${event.status} ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <ToolEventStatusIcon status={event.status} />
      <span className="qp-ai-modal-toolchip-label">{getToolEventLabel(event.toolName)}</span>
    </button>
  );
}

function ThoughtSummaryRail({ events }: { events: ToolEvent[] }) {
  const startMs = Math.min(...events.map((e) => e.startedAt));
  const endMs = Math.max(...events.map((e) => e.endedAt ?? e.startedAt));
  const secs = ((endMs - startMs) / 1000).toFixed(1);

  return (
    <div className="qp-ai-modal-toolrail">
      <span className="qp-ai-modal-thought-label">Thought for {secs}s</span>
    </div>
  );
}

function AssistantMessageMarkdown({ content }: { content: string }) {
  return (
    <div className="qp-ai-modal-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ node: _node, children, ...props }) => (
            <div className="qp-ai-modal-markdown-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ChartPreview({
  chartSpec,
  darkMode = false,
}: {
  chartSpec: unknown;
  darkMode?: boolean;
}) {
  const isNarrowChart = useAiChartModalNarrowLayout();
  const parsed = useMemo(() => {
    try {
      const spec = typeof chartSpec === "string" ? JSON.parse(chartSpec) : chartSpec;
      if (!spec || typeof spec !== "object") {
        return {
          error: "Invalid chart specification",
          spec: null,
          chartType: "bar",
          chartData: [] as Record<string, unknown>[],
        };
      }

      const record = spec as Record<string, unknown>;
      if (record.kind === "chart") {
        return {
          error: null,
          spec: record,
          chartType:
            typeof (record.encoding as { chartType?: unknown } | undefined)?.chartType === "string"
              ? ((record.encoding as { chartType: string }).chartType || "bar")
              : "bar",
          chartData: Array.isArray(record.data) ? (record.data as Record<string, unknown>[]) : [],
        };
      }

      const mark = record.mark;
      const chartType =
        typeof mark === "string"
          ? mark
          : mark && typeof mark === "object" && typeof (mark as { type?: unknown }).type === "string"
            ? (mark as { type: string }).type
            : "bar";

      const data = record.data;
      const chartData =
        data && typeof data === "object" && Array.isArray((data as { values?: unknown }).values)
          ? ((data as { values: Record<string, unknown>[] }).values ?? [])
          : [];

      return { error: null, spec: record, chartType, chartData };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to render chart",
        spec: null,
        chartType: "bar",
        chartData: [] as Record<string, unknown>[],
      };
    }
  }, [chartSpec]);

  const { error, spec, chartType, chartData } = parsed;

  const gridStroke = darkMode ? "#3f3f46" : "#e2e8f0";
  const tickFill = darkMode ? "#a1a1aa" : "#64748b";
  let tickFontSize = isNarrowChart ? 12 : 10;
  let xAxisAngle = isNarrowChart && chartData.length > 3 ? -38 : 0;
  let xAxisHeight = isNarrowChart ? (chartData.length > 5 ? 64 : chartData.length > 3 ? 52 : 32) : 48;
  let chartMargins = isNarrowChart
    ? { top: 10, right: 6, left: 2, bottom: chartData.length > 3 ? Math.max(36, xAxisHeight - 8) : 16 }
    : { top: 8, right: 8, left: 4, bottom: 18 };
  const tooltipStyles = getTooltipStyles(darkMode, isNarrowChart);

  if (error || !chartData || chartData.length === 0) {
    return (
      <div
        className={`qp-ai-modal-chart-preview qp-ai-modal-chart-preview-empty${isNarrowChart ? " qp-ai-modal-chart-preview--narrow" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isNarrowChart ? 13 : 12,
          color: darkMode ? "#fca5a5" : "#dc2626",
          background: darkMode ? "rgba(239,68,68,0.18)" : "#fef2f2",
          borderRadius: isNarrowChart ? 10 : 4,
          border: darkMode ? "1px solid rgba(239,68,68,0.35)" : "1px solid #fecaca",
          padding: isNarrowChart ? 14 : 8,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{error ? "Chart Error" : "No Data"}</div>
          <div style={{ opacity: 0.75 }}>{error || "No data available"}</div>
        </div>
      </div>
    );
  }

  // Use encoding from vizspec when present (kind === "chart"), so x/y/series/tooltips map correctly
  const encoding =
    spec?.kind === "chart" && spec.encoding && typeof spec.encoding === "object"
      ? (spec.encoding as Record<string, unknown>)
      : null;
  const xRef =
    encoding?.x && typeof encoding.x === "object"
      ? (encoding.x as { field?: unknown; type?: unknown })
      : null;
  const yRef =
    encoding?.y && typeof encoding.y === "object"
      ? (encoding.y as { field?: unknown; type?: unknown })
      : null;
  const xField = typeof xRef?.field === "string" ? xRef.field : undefined;
  const yField = typeof yRef?.field === "string" ? yRef.field : undefined;
  const yType = typeof yRef?.type === "string" ? yRef.type : undefined;
  const seriesRef = encoding?.series;
  const seriesField =
    typeof seriesRef === "string"
      ? seriesRef
      : (seriesRef && typeof seriesRef === "object" && "field" in seriesRef && typeof (seriesRef as { field?: unknown }).field === "string")
        ? (seriesRef as { field: string }).field
        : undefined;
  const tooltipFields = Array.isArray(encoding?.tooltips) ? encoding.tooltips : [];
  const firstTooltipField =
    tooltipFields.length > 0 && typeof tooltipFields[0] === "object" && tooltipFields[0] !== null && "field" in tooltipFields[0]
      ? (tooltipFields[0] as { field?: string }).field
      : undefined;

  const firstRow = chartData[0] ?? {};
  const firstRowKeys = Object.keys(firstRow);

  // For pie, backend uses encoding.series (slice label) and tooltips[0] (slice size)
  const isPie = chartType === "pie" || chartType === "arc";
  let categoryKey: string;
  let dataKey: string;
  if (isPie) {
    if (typeof seriesField === "string" && seriesField in firstRow) {
      categoryKey = seriesField;
    } else {
      categoryKey = firstRowKeys.find((k) => !isNumericChartValue(firstRow[k])) ?? firstRowKeys[0] ?? "name";
    }
    if (typeof firstTooltipField === "string" && firstTooltipField in firstRow) {
      dataKey = firstTooltipField;
    } else if (typeof yField === "string" && yField in firstRow) {
      dataKey = yField;
    } else {
      dataKey = firstRowKeys.find((k) => isNumericChartValue(firstRow[k])) ?? firstRowKeys.find((k) => k !== categoryKey) ?? "value";
    }
  } else {
    categoryKey =
      typeof xField === "string" && xField in firstRow
        ? xField
        : "category" in firstRow
          ? "category"
          : "date" in firstRow
            ? "date"
            : firstRowKeys[0] ?? "category";
    dataKey =
      typeof yField === "string" && yField in firstRow
        ? yField
        : firstRowKeys.find((k) => k !== "category" && k !== "date") ?? "value";
  }
  if (isPie && categoryKey === dataKey && firstRowKeys.length > 1) {
    const valueKey = firstRowKeys.find((k) => isNumericChartValue(firstRow[k]));
    const labelKey = firstRowKeys.find((k) => !isNumericChartValue(firstRow[k]));
    if (valueKey && labelKey) {
      dataKey = valueKey;
      categoryKey = labelKey;
    } else {
      const other = firstRowKeys.find((k) => k !== dataKey);
      if (other !== undefined) categoryKey = other;
    }
  }

  // Coerce quantitative values to numbers (API often returns strings); for pie always coerce value field
  const valueNeedsCoerce =
    yType === "quantitative" ||
    (isPie && (tooltipFields[0]?.type === "quantitative" || isNumericChartValue(firstRow[dataKey])));
  const chartDataNormalized =
    valueNeedsCoerce && dataKey
      ? chartData.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          const v = r[dataKey];
          if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) {
            r[dataKey] = Number(v);
          }
          return r;
        })
      : chartData;
  const longestCategoryLabel = chartDataNormalized.reduce((max, row) => {
    const formatted = formatTimestampForDisplay(row[categoryKey]);
    return Math.max(max, String(formatted ?? "").length);
  }, 0);
  const needsCompactXAxis =
    chartDataNormalized.length >= (isNarrowChart ? 4 : 7) ||
    longestCategoryLabel > (isNarrowChart ? 8 : 12);
  if (needsCompactXAxis) {
    tickFontSize = isNarrowChart ? 12 : 9;
    xAxisAngle = isNarrowChart ? -38 : -30;
    xAxisHeight = isNarrowChart ? 64 : 56;
    chartMargins = isNarrowChart
      ? { top: 10, right: 6, left: 2, bottom: Math.max(36, xAxisHeight - 8) }
      : { top: 8, right: 8, left: 4, bottom: 30 };
  }

  const renderChart = () => {
    const data = chartDataNormalized;
    if (chartType === "pie" || chartType === "arc") {
      return (
        <PieChart>
          <Tooltip
            formatter={(value, name) => [formatTooltipValue(value), String(name)]}
            contentStyle={tooltipStyles.contentStyle}
            itemStyle={tooltipStyles.itemStyle}
            labelStyle={tooltipStyles.labelStyle}
          />
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={categoryKey}
            cx="50%"
            cy="50%"
            innerRadius={isNarrowChart ? "18%" : 0}
            outerRadius={isNarrowChart ? "78%" : 60}
            paddingAngle={isNarrowChart ? 1.5 : 0}
            label={
              isNarrowChart
                ? ({ name, percent }) =>
                    `${formatTimestampForDisplay(name)} ${((percent ?? 0) * 100).toFixed(0)}%`
                : ({ name }) => formatTimestampForDisplay(name)
            }
            labelLine={isNarrowChart}
          >
            {data.map((entry, index) => {
              const item = entry as Record<string, unknown>;
              const key = String(item[categoryKey] ?? item.category ?? item.date ?? index);
              return <Cell key={key} fill={COLORS[index % COLORS.length]} />;
            })}
          </Pie>
        </PieChart>
      );
    }
    if (chartType === "line") {
      return (
        <LineChart data={data} margin={chartMargins}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey={categoryKey}
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            tickFormatter={formatTimestampForDisplay}
            angle={xAxisAngle}
            textAnchor={xAxisAngle ? "end" : "middle"}
            height={xAxisHeight}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            width={isNarrowChart ? 44 : 36}
            tickFormatter={(v) => (typeof v === "number" && Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v))}
          />
          <Tooltip
            formatter={(value, name) => [formatTooltipValue(value), String(name)]}
            contentStyle={tooltipStyles.contentStyle}
            itemStyle={tooltipStyles.itemStyle}
            labelStyle={tooltipStyles.labelStyle}
            cursor={tooltipStyles.cursor}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={COLORS[0]}
            strokeWidth={isNarrowChart ? 2.5 : 2}
            dot={isNarrowChart ? { r: 3, strokeWidth: 1, fill: COLORS[0] } : false}
            activeDot={{ r: isNarrowChart ? 6 : 5 }}
          />
        </LineChart>
      );
    }
    if (chartType === "area") {
      return (
        <AreaChart data={data} margin={chartMargins}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey={categoryKey}
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            tickFormatter={formatTimestampForDisplay}
            angle={xAxisAngle}
            textAnchor={xAxisAngle ? "end" : "middle"}
            height={xAxisHeight}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            width={isNarrowChart ? 44 : 36}
            tickFormatter={(v) => (typeof v === "number" && Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v))}
          />
          <Tooltip
            formatter={(value, name) => [formatTooltipValue(value), String(name)]}
            contentStyle={tooltipStyles.contentStyle}
            itemStyle={tooltipStyles.itemStyle}
            labelStyle={tooltipStyles.labelStyle}
            cursor={tooltipStyles.cursor}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={COLORS[0]}
            fill={COLORS[0]}
            fillOpacity={0.6}
            strokeWidth={isNarrowChart ? 2 : 1.5}
          />
        </AreaChart>
      );
    }
    return (
      <BarChart data={data} margin={chartMargins} barCategoryGap={isNarrowChart ? "18%" : "10%"}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey={categoryKey}
          tick={{ fontSize: tickFontSize, fill: tickFill }}
          tickFormatter={formatTimestampForDisplay}
          angle={xAxisAngle}
          textAnchor={xAxisAngle ? "end" : "middle"}
          height={xAxisHeight}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: tickFontSize, fill: tickFill }}
          width={isNarrowChart ? 44 : 36}
          tickFormatter={(v) => (typeof v === "number" && Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v))}
        />
        <Tooltip
          formatter={(value, name) => [formatTooltipValue(value), String(name)]}
          contentStyle={tooltipStyles.contentStyle}
          itemStyle={tooltipStyles.itemStyle}
          labelStyle={tooltipStyles.labelStyle}
          cursor={tooltipStyles.cursor}
        />
        <Bar
          dataKey={dataKey}
          fill={COLORS[0]}
          radius={isNarrowChart ? [6, 6, 2, 2] : [4, 4, 0, 0]}
          maxBarSize={isNarrowChart ? 48 : 56}
        />
      </BarChart>
    );
  };

  return (
    <div
      className={`qp-ai-modal-chart-preview${isNarrowChart ? " qp-ai-modal-chart-preview--narrow" : ""}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

function JsonRenderPreview({
  spec,
  queryResultBaseUrl,
  requestHeaders,
}: {
  spec: unknown;
  queryResultBaseUrl: string;
  requestHeaders?: Record<string, string>;
}) {
  const isNarrowChart = useAiChartModalNarrowLayout();

  return (
    <div
      className={`qp-ai-modal-chart-preview${isNarrowChart ? " qp-ai-modal-chart-preview--narrow" : ""}`}
    >
      <PersistedSpecRenderer
        spec={spec}
        queryResultBaseUrl={queryResultBaseUrl}
        requestHeaders={requestHeaders}
      />
    </div>
  );
}

export function AIChartModal({
  isOpen,
  onClose,
  onAddChart,
  organizationId,
  dashboardId,
  initialPrompt,
  dashboardType = "customer",
  generateChartWithSqlUrl = "/api/ai/generate-chart-with-sql",
  datasourcesUrl = "/api/datasources",
  headers = EMPTY_HEADERS,
  queryResultBaseUrl = "/api/query-results",
  darkMode = false,
  availableDatasourceIds,
  defaultTenantFieldName,
  tenantFieldByDatasource,
  hideTenantInputs = false,
  title: titleProp,
  createTitle: createTitleProp,
  chartModelOptions = DEFAULT_AI_CHART_MODEL_OPTIONS,
  defaultChartModel = "gpt-5.4-mini",
}: AIChartModalProps) {
  const modalTitle = titleProp ?? "AI Visualization Generator";
  const createTitle = createTitleProp ?? "Create a Visualization";
  const useMastraStream = isMastraAgentStreamUrl(generateChartWithSqlUrl);
  const enableModelOverride = false;

  const getResolvedTenantField = (
    selectedIds: string[],
    byDs: Record<string, string> | null | undefined,
    defaultName: string | null | undefined
  ) => {
    const firstId = selectedIds[0];
    if (firstId && byDs && byDs[firstId]?.trim()) return byDs[firstId].trim();
    return defaultName?.trim() || "tenant_id";
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const [selectedDatasourceIds, setSelectedDatasourceIds] = useState<string[]>([]);
  const [tenantFieldName, setTenantFieldName] = useState(() =>
    getResolvedTenantField([], tenantFieldByDatasource, defaultTenantFieldName)
  );
  const [previewTenantId, setPreviewTenantId] = useState("");
  const [querypanelSessionId, setQuerypanelSessionId] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null);
  const [lastSqlExecution, setLastSqlExecution] = useState<SqlExecutionArtifact | null>(null);
  const [chartModel, setChartModel] = useState(() => {
    const allowed = new Set(chartModelOptions.map((o) => o.value));
    return allowed.has(defaultChartModel) ? defaultChartModel : (chartModelOptions[0]?.value ?? "");
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const tenantFieldId = useId();
  const previewTenantIdFieldId = useId();
  const chartModelId = useId();
  const mobileSettingsSheetTitleId = useId();
  const mobileSettingsDoneRef = useRef<HTMLButtonElement>(null);
  const mobileSettingsTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSheetWasOpenRef = useRef(false);
  /** Prevents duplicate error rows when catch runs more than once (e.g. React Strict Mode). */
  const streamFailureHandledRef = useRef(false);
  const isNarrowLayout = useAiChartModalNarrowLayout();
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Sync with document theme when modal is open so switching theme (e.g. next-themes) updates the header immediately.
  const [docDarkMode, setDocDarkMode] = useState(false);
  useLayoutEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const html = document.documentElement;
    const detect = () =>
      html.classList.contains("dark") ||
      html.getAttribute("data-theme") === "dark" ||
      html.style.colorScheme === "dark";
    setDocDarkMode(detect());
    const observer = new MutationObserver(() => setDocDarkMode(detect()));
    observer.observe(html, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, [isOpen]);

  // When open, use document theme so toggling theme updates the modal; otherwise use prop.
  // Read from document on render when open so first paint has correct theme (no flash).
  const docDarkLive =
    isOpen &&
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("dark") ||
      document.documentElement.getAttribute("data-theme") === "dark" ||
      document.documentElement.style.colorScheme === "dark");
  const effectiveDarkMode = isOpen ? (docDarkLive ?? docDarkMode) : (darkMode ?? false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, transientStatus, toolEvents, lastSqlExecution, activeAssistantMessageId]);

  useEffect(() => {
    if (isOpen && promptInputRef.current) {
      setTimeout(() => promptInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialPrompt && messages.length === 0) {
      setInputValue(initialPrompt);
    }
  }, [isOpen, initialPrompt, messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const allowed = new Set(chartModelOptions.map((o) => o.value));
    const next = allowed.has(defaultChartModel)
      ? defaultChartModel
      : (chartModelOptions[0]?.value ?? "");
    setChartModel(next);
  }, [isOpen, defaultChartModel, chartModelOptions]);

  useEffect(() => {
    if (!isOpen) {
      setMobileSettingsOpen(false);
      setTimeout(() => {
        setMessages([]);
        setInputValue("");
        setIsLoading(false);
        setTransientStatus(null);
        setQuerypanelSessionId(null);
        setToolEvents([]);
        setActiveAssistantMessageId(null);
        setLastSqlExecution(null);
      }, 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isNarrowLayout) setMobileSettingsOpen(false);
  }, [isNarrowLayout]);

  useEffect(() => {
    if (!isNarrowLayout || !mobileSettingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMobileSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isNarrowLayout, mobileSettingsOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      mobileSheetWasOpenRef.current = false;
      return;
    }
    if (!isNarrowLayout) {
      mobileSheetWasOpenRef.current = false;
      return;
    }
    if (mobileSettingsOpen) {
      mobileSheetWasOpenRef.current = true;
      mobileSettingsDoneRef.current?.focus({ preventScroll: true });
      return;
    }
    if (mobileSheetWasOpenRef.current) {
      mobileSheetWasOpenRef.current = false;
      mobileSettingsTriggerRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen, isNarrowLayout, mobileSettingsOpen]);

  useEffect(() => {
    if (isOpen) {
      const firstId = selectedDatasourceIds[0];
      const resolved =
        firstId && tenantFieldByDatasource?.[firstId]?.trim()
          ? tenantFieldByDatasource[firstId].trim()
          : defaultTenantFieldName?.trim() || "tenant_id";
      setTenantFieldName(resolved);
    }
  }, [isOpen, defaultTenantFieldName, tenantFieldByDatasource, selectedDatasourceIds]);

  const handleSendMessage = async (prompt?: string) => {
    const messageText = prompt || inputValue.trim();
    if (!messageText || isLoading) return;
    streamFailureHandledRef.current = false;
    if (useMastraStream && selectedDatasourceIds.length !== 1) {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId("error"),
          role: "assistant",
          content: "Select exactly one datasource before generating a visualization with the native Mastra agent.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    const userMessage: Message = {
      id: createMessageId("user"),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    const latestResultId = shouldReuseLatestResultId(messageText)
      ? getLatestResultId(messages)
      : undefined;

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setTransientStatus("Thinking");
    setToolEvents([]);
    setLastSqlExecution(null);
    let assistantMessageId: string | null = null;

    try {
      if (useMastraStream) {
        const threadId = querypanelSessionId || createMessageId(`chart-${dashboardId}`);
        const currentAssistantMessageId = createMessageId("assistant");
        assistantMessageId = currentAssistantMessageId;
        setActiveAssistantMessageId(currentAssistantMessageId);
        const resourceId = `dashboard-${organizationId}-${dashboardId}`;

        setMessages((prev) => [
          ...prev,
          {
            id: currentAssistantMessageId,
            role: "assistant",
            kind: "status",
            content: "",
            sqlParams: null,
            timestamp: new Date(),
          },
        ]);
        setQuerypanelSessionId(threadId);

        const response = await fetch(generateChartWithSqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": organizationId,
            ...headers,
          },
          body: JSON.stringify({
            messages: messageText,
            memory: {
              thread: threadId,
              resource: resourceId,
            },
            requestContext: {
              organizationId,
              datasourceId: selectedDatasourceIds[0],
              ...(latestResultId ? { resultId: latestResultId } : {}),
              ...(hideTenantInputs ? {} : { tenantId: previewTenantId.trim() || undefined }),
              ...(tenantFieldName.trim()
                ? { tenantFieldName: tenantFieldName.trim() }
                : {}),
            },
            savePerStep: true,
            ...(enableModelOverride && chartModel.trim()
              ? { model: normalizeModelForMastraStreamBody(chartModel) }
              : {}),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to generate chart");
        }

        const updateAssistantMessage = (
          updates: Partial<Message> | ((current: Message) => Message),
        ) => {
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== currentAssistantMessageId) {
                return message;
              }

              return typeof updates === "function" ? updates(message) : { ...message, ...updates };
            }),
          );
        };

        await consumeMastraChartStream(
          response.body,
          createMastraChartChunkHandler({
            assistantMessageId: currentAssistantMessageId,
            createMessageId,
            updateAssistantMessage,
            setTransientStatus,
            setToolEvents,
            setMessages,
            setLastSqlExecution,
          }),
        );

        updateAssistantMessage((current) => ({
          ...current,
          content:
            current.content.trim().length > 0
              ? current.content
              : current.jsonRenderSpec || current.chartSpec
                ? current.presentationKind === "table"
                  ? "I've prepared a table for you."
                  : "I've prepared a visualization for you."
                : "I processed your request.",
        }));
        setToolEvents((current) => {
          if (current.length > 0) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentAssistantMessageId ||
                (m.sourceAssistantId === currentAssistantMessageId && m.kind === "explanation")
                  ? { ...m, toolEvents: current }
                  : m
              )
            );
          }
          return [];
        });
        setTransientStatus(null);
      } else {
        const response = await fetch(generateChartWithSqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": organizationId,
            ...headers,
          },
          body: JSON.stringify({
            prompt: messageText,
            dashboardId,
            datasourceIds: selectedDatasourceIds.length > 0 ? selectedDatasourceIds : undefined,
            tenantFieldName: tenantFieldName.trim() || undefined,
            ...(hideTenantInputs ? {} : { previewTenantId: previewTenantId.trim() || undefined }),
            conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
            ...(querypanelSessionId ? { querypanelSessionId } : {}),
            ...(enableModelOverride && chartModel.trim() ? { model: chartModel.trim() } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate chart");
        }

        const data = await response.json();

        const assistantMessage: Message = {
          id: createMessageId("assistant"),
          role: "assistant",
          content: data.message || "I've created a chart for you!",
          chartSpec: data.chartSpec,
          rationale: data.rationale,
          sql: data.sql,
          sqlParams: (data.params as Record<string, unknown> | null) ?? null,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setTransientStatus(null);
        if (data.sessionId) setQuerypanelSessionId(data.sessionId);
      }
    } catch (err) {
      console.error("[AIChartModal] chart generation failed", err);
      setTransientStatus(null);
      if (!streamFailureHandledRef.current) {
        streamFailureHandledRef.current = true;
        const errorMessageId = createMessageId("error");
        const terminalMessage =
          err instanceof MastraStreamTerminalError && err.message.trim().length > 0
            ? err.message.trim()
            : null;
        const errorContent =
          terminalMessage ??
          "Sorry, I couldn't generate that chart. Please try again or rephrase your request.";
        let finalisedToolEvents: ToolEvent[] = [];
        setToolEvents((current) => {
          finalisedToolEvents = current.map((event) =>
            event.status === "running"
              ? { ...event, status: "failed" as const, endedAt: Date.now(), error: "Failed" }
              : event
          );
          return [];
        });
        setMessages((prev) => {
          const withoutPlaceholder = prev.filter((m) => m.id !== assistantMessageId);
          if (withoutPlaceholder.some((m) => m.id === errorMessageId)) {
            return withoutPlaceholder;
          }
          return [
            ...withoutPlaceholder,
            {
              id: errorMessageId,
              role: "assistant" as const,
              content: errorContent,
              timestamp: new Date(),
              ...(finalisedToolEvents.length > 0 ? { toolEvents: finalisedToolEvents } : {}),
            },
          ];
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChartToEditor = (message: Message) => {
    onAddChart(
      message.jsonRenderSpec ?? message.chartSpec,
      getMessageRationale(message),
      message.sql,
      selectedDatasourceIds,
      message.sqlParams,
      tenantFieldName.trim() || undefined,
      hideTenantInputs ? undefined : previewTenantId.trim() || undefined,
      message.resultId ?? message.queryResult?.resultId
    );
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Escape") {
      if (isNarrowLayout && mobileSettingsOpen) {
        e.preventDefault();
        setMobileSettingsOpen(false);
        return;
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const tenantSettingsVisible = dashboardType === "customer" && !hideTenantInputs;
  const datasourceSummaryShort =
    selectedDatasourceIds.length === 0
      ? "Tap to choose a datasource"
      : selectedDatasourceIds.length === 1
        ? "1 datasource selected"
        : `${selectedDatasourceIds.length} datasources selected`;

  const settingsPaneInner = (
    <>
      <div className="qp-ai-modal-settings-block">
        <span className="qp-ai-modal-settings-heading">Datasource</span>
        <DatasourceSelector
          organizationId={organizationId}
          selectedIds={selectedDatasourceIds}
          onSelectionChange={setSelectedDatasourceIds}
          selectionMode={useMastraStream ? "single" : "multiple"}
          datasourcesUrl={datasourcesUrl}
          headers={headers}
          darkMode={effectiveDarkMode}
          allowedIds={availableDatasourceIds}
          fullWidth
        />
      </div>

      {tenantSettingsVisible && (
        <div className="qp-ai-modal-settings-block qp-ai-modal-settings-tenant">
          <div>
            <label htmlFor={tenantFieldId} className="qp-ai-modal-label">
              Tenant field name (optional)
            </label>
            <input
              id={tenantFieldId}
              type="text"
              value={tenantFieldName}
              onChange={(e) => setTenantFieldName(e.target.value)}
              placeholder="tenant_id"
              className="qp-ai-modal-input"
            />
          </div>
          <div>
            <label htmlFor={previewTenantIdFieldId} className="qp-ai-modal-label">
              Preview as tenant ID (optional)
            </label>
            <input
              id={previewTenantIdFieldId}
              type="text"
              value={previewTenantId}
              onChange={(e) => setPreviewTenantId(e.target.value)}
              placeholder="tenant_a"
              className="qp-ai-modal-input"
            />
          </div>
        </div>
      )}
    </>
  );

  const modalContent = (
    <div
      data-qp-ai-modal
      data-theme={effectiveDarkMode ? "dark" : "light"}
      data-qp-ai-mobile-sheet-open={isNarrowLayout && mobileSettingsOpen ? "true" : undefined}
    >
      <button
        type="button"
        className="qp-ai-modal-backdrop"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="qp-ai-modal-wrap">
        <div className="qp-ai-modal-dialog" role="dialog" aria-modal="true">
          <div className="qp-ai-modal-header">
            <div className="qp-ai-modal-header-inner">
              <div className="qp-ai-modal-header-brand">
                <div className="qp-ai-modal-header-icon">
                  <SparklesIcon className="w-4 h-4" style={{ color: "#fff" }} />
                </div>
                <div>
                  <h2 className="qp-ai-modal-title">{modalTitle}</h2>
                  <p className="qp-ai-modal-subtitle">
                    Describe your visualization in natural language
                  </p>
                </div>
              </div>
              <div className="qp-ai-modal-header-actions">
                {isLoading && (
                  <div className="qp-ai-modal-status-pill" aria-live="polite">
                    <span className="qp-ai-modal-status-dot" />
                    <span className="qp-ai-modal-status-text">{transientStatus ?? "Working"}</span>
                  </div>
                )}
                {!isLoading && querypanelSessionId && (
                  <div className="qp-ai-modal-session-pill" title={`Session: ${querypanelSessionId}`}>
                    <Wand2Icon className="w-4 h-4" />
                    <span className="qp-ai-modal-session-pill-text">Session</span>
                  </div>
                )}
              <button
                type="button"
                onClick={onClose}
                className="qp-ai-modal-close"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
              </div>
            </div>
          </div>

          <div
            className={`qp-ai-modal-body qp-ai-modal-body-split${isNarrowLayout ? " qp-ai-modal-body-narrow" : ""}`}
          >
            <div
              className="qp-ai-modal-chat-pane"
              inert={isNarrowLayout && mobileSettingsOpen ? true : undefined}
            >
              <div className="qp-ai-modal-messages">
                {messages.length === 0 && (
                  <div className="qp-ai-modal-empty">
                    <div className="qp-ai-modal-empty-inner">
                      <div className="qp-ai-modal-empty-icon-wrap">
                        <SparklesIcon className="qp-ai-modal-empty-icon w-8 h-8" />
                      </div>
                      <h3 className="qp-ai-modal-empty-title">{createTitle}</h3>
                      <p className="qp-ai-modal-empty-text">
                        Describe your visualization in natural language
                      </p>
                      <div className="qp-ai-modal-suggestions">
                        <button
                          type="button"
                          className="qp-ai-modal-suggestion"
                          onClick={() => handleSendMessage("Show revenue by month as a line chart")}
                          disabled={isLoading}
                        >
                          Revenue by month
                        </button>
                        <button
                          type="button"
                          className="qp-ai-modal-suggestion"
                          onClick={() => handleSendMessage("Show top 10 customers by total spend as a bar chart")}
                          disabled={isLoading}
                        >
                          Top customers
                        </button>
                        <button
                          type="button"
                          className="qp-ai-modal-suggestion"
                          onClick={() => handleSendMessage("Show the latest customer signups in a table")}
                          disabled={isLoading}
                        >
                          Signup table
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((message) => {
                  const isActiveAssistant =
                    message.role === "assistant" && message.id === activeAssistantMessageId;
                  const messageQueryResult =
                    message.queryResult ?? (isActiveAssistant ? lastSqlExecution : null);
                  const assistantHasVisualization = Boolean(message.jsonRenderSpec || message.chartSpec);
                  const isStreamItem =
                    message.kind === "status" ||
                    message.kind === "chart" ||
                    message.kind === "action" ||
                    message.kind === "explanation";
                  /** While the active turn is still streaming, hide narrative text until a chart/table spec exists so it only appears under the viz. */
                  const showAssistantMarkdown =
                    message.role === "assistant" &&
                    message.content.trim().length > 0 &&
                    (message.kind === "explanation" ||
                      (!isStreamItem && (!isActiveAssistant || !isLoading || assistantHasVisualization)));
                  const hasVisibleAssistantState =
                    isStreamItem ||
                    message.content.trim().length > 0 ||
                    Boolean(message.jsonRenderSpec) ||
                    Boolean(message.chartSpec) ||
                    Boolean(messageQueryResult) ||
                    Boolean(message.toolEvents?.length) ||
                    (isActiveAssistant &&
                      (isLoading || toolEvents.length > 0 || Boolean(lastSqlExecution)));

                  if (message.role === "assistant" && !hasVisibleAssistantState) {
                    return null;
                  }

                  return (
                    <div
                      key={message.id}
                      className={`qp-ai-modal-msg-row ${message.role === "user" ? "user" : ""}`}
                    >
                      <div className={`qp-ai-modal-msg-bubble ${message.role}`}>
                        {message.role === "assistant" &&
                          message.kind === "status" &&
                          message.id === activeAssistantMessageId &&
                          isLoading &&
                          !toolEvents.some((e) => e.status === "running") &&
                          !message.content.trim() &&
                          !message.jsonRenderSpec &&
                          !message.chartSpec &&
                          !messageQueryResult && (
                            <div className="qp-ai-modal-toolrail" aria-live="polite" aria-label="Assistant status">
                              <span className="qp-ai-modal-step-text">
                                <LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
                                {transientStatus ?? "Thinking"}
                              </span>
                            </div>
                          )}

                        {message.role === "assistant" &&
                          message.kind === "status" &&
                          message.id === activeAssistantMessageId &&
                          toolEvents.some((e) => e.status === "running") && (
                            <div className="qp-ai-modal-toolrail" aria-label="Agent steps">
                              {toolEvents.filter((e) => e.status === "running").map((event) => (
                                <span key={event.id} className="qp-ai-modal-step-text">
                                  <LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
                                  {getToolEventLabel(event.toolName)}
                                </span>
                              ))}
                            </div>
                          )}

                        {message.role === "assistant" &&
                          message.kind === "status" &&
                          message.toolEvents &&
                          message.toolEvents.length > 0 && <ThoughtSummaryRail events={message.toolEvents} />}

                        {message.kind === "chart" && (
                          <div className="qp-ai-modal-chart-stack">
                            <div className="qp-ai-modal-chart-stack-preview">
                              {message.jsonRenderSpec ? (
                                <JsonRenderPreview
                                  spec={message.jsonRenderSpec}
                                  queryResultBaseUrl={queryResultBaseUrl}
                                  requestHeaders={headers}
                                />
                              ) : (
                                <ChartPreview
                                  chartSpec={withVizSpecDataFallback(
                                    message.chartSpec,
                                    Array.isArray(message.queryResult?.rows)
                                      ? (message.queryResult.rows as Array<Record<string, unknown>>)
                                      : message.sourceAssistantId === activeAssistantMessageId
                                        ? (lastSqlExecution?.rows ?? null)
                                        : null
                                  )}
                                  darkMode={effectiveDarkMode}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {message.kind === "action" && (
                          <div className="qp-ai-modal-chart-action-item">
                            <button
                              type="button"
                              onClick={() => handleAddChartToEditor(message)}
                              className="qp-ai-modal-add-chart-btn"
                            >
                              Add to dashboard
                            </button>
                          </div>
                        )}

                        {message.kind === "explanation" && (
                          <>
                            {message.toolEvents && message.toolEvents.length > 0 && (
                              <ThoughtSummaryRail events={message.toolEvents} />
                            )}
                            <AssistantMessageMarkdown content={message.content} />
                          </>
                        )}

                        {!isStreamItem && Boolean(message.jsonRenderSpec || message.chartSpec) && (
                          <div className="qp-ai-modal-chart-stack">
                            <div className="qp-ai-modal-chart-stack-preview">
                              {message.jsonRenderSpec ? (
                                <JsonRenderPreview
                                  spec={message.jsonRenderSpec}
                                  queryResultBaseUrl={queryResultBaseUrl}
                                  requestHeaders={headers}
                                />
                              ) : (
                                <ChartPreview
                                  chartSpec={withVizSpecDataFallback(
                                    message.chartSpec,
                                    Array.isArray(message.queryResult?.rows)
                                      ? (message.queryResult.rows as Array<Record<string, unknown>>)
                                      : message.id === activeAssistantMessageId
                                        ? (lastSqlExecution?.rows ?? null)
                                        : null
                                  )}
                                  darkMode={effectiveDarkMode}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {!isStreamItem && Boolean(message.jsonRenderSpec || message.chartSpec) && (
                          <div className="qp-ai-modal-chart-action-item">
                            <button
                              type="button"
                              onClick={() => handleAddChartToEditor(message)}
                              className="qp-ai-modal-add-chart-btn"
                            >
                              Add to dashboard
                            </button>
                          </div>
                        )}

                        {message.role === "user" && message.content.trim().length > 0 && (
                          <div>{message.content}</div>
                        )}
                        {!isStreamItem && showAssistantMarkdown && (
                          <AssistantMessageMarkdown content={message.content} />
                        )}

                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              {isNarrowLayout && (
                <div className="qp-ai-modal-mobile-settings-strip">
                  <button
                    ref={mobileSettingsTriggerRef}
                    type="button"
                    className={`qp-ai-modal-mobile-settings-trigger${
                      selectedDatasourceIds.length === 0 ? " qp-ai-modal-mobile-settings-trigger-attention" : ""
                    }`}
                    onClick={() => setMobileSettingsOpen(true)}
                    aria-expanded={mobileSettingsOpen}
                    aria-controls="qp-ai-chart-mobile-settings-sheet"
                  >
                    <span className="qp-ai-modal-mobile-settings-trigger-icon" aria-hidden>
                      <SlidersHorizontalIcon className="w-4 h-4" />
                    </span>
                    <span className="qp-ai-modal-mobile-settings-trigger-copy">
                      <span className="qp-ai-modal-mobile-settings-trigger-kicker">Data & preview</span>
                      <span className="qp-ai-modal-mobile-settings-trigger-line">{datasourceSummaryShort}</span>
                    </span>
                    {tenantSettingsVisible && previewTenantId.trim() ? (
                      <span className="qp-ai-modal-mobile-settings-tenant-pill" title="Preview tenant">
                        {previewTenantId.trim()}
                      </span>
                    ) : null}
                    <ChevronUpIcon className="qp-ai-modal-mobile-settings-open-hint w-4 h-4" aria-hidden />
                  </button>
                </div>
              )}

              <div className="qp-ai-modal-footer">
                <div className="qp-ai-modal-pill-compose">
                  <input
                    ref={promptInputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder="Ask a question or request a chart or table"
                    className="qp-ai-modal-pill-input"
                    aria-label="Chart prompt"
                    autoComplete="off"
                  />
                  {chartModelOptions.length > 0 && (
                    <select
                      id={chartModelId}
                      className="qp-ai-modal-pill-model"
                      value=""
                      onChange={undefined}
                      disabled
                      title="Model (server default)"
                      aria-label="Model (server default)"
                    >
                      {chartModelOptions.map((opt, i) => (
                        <option key={`${i}-${opt.label}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isLoading}
                    className="qp-ai-modal-pill-send"
                    aria-label="Send message"
                  >
                    <SendIcon className="w-4 h-4" style={{ color: "#fff" }} />
                  </button>
                </div>
              </div>
            </div>

            {!isNarrowLayout && (
              <aside className="qp-ai-modal-settings-pane" aria-label="Chart settings">
                {settingsPaneInner}
              </aside>
            )}

            {isNarrowLayout && mobileSettingsOpen ? (
              <div
                className="qp-ai-modal-mobile-sheet-root"
                role="presentation"
                onClick={() => setMobileSettingsOpen(false)}
              >
                <div
                  id="qp-ai-chart-mobile-settings-sheet"
                  className="qp-ai-modal-mobile-sheet"
                  role="region"
                  aria-labelledby={mobileSettingsSheetTitleId}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="qp-ai-modal-mobile-sheet-handle-wrap" aria-hidden>
                    <span className="qp-ai-modal-mobile-sheet-handle" />
                  </div>
                  <div className="qp-ai-modal-mobile-sheet-toolbar">
                    <h3 className="qp-ai-modal-mobile-sheet-title" id={mobileSettingsSheetTitleId}>
                      Data & preview
                    </h3>
                    <button
                      ref={mobileSettingsDoneRef}
                      type="button"
                      className="qp-ai-modal-mobile-sheet-done"
                      onClick={() => setMobileSettingsOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                  <p className="qp-ai-modal-mobile-sheet-subtitle">
                    Pick where the chart runs and how tenant preview is applied.
                  </p>
                  <div className="qp-ai-modal-mobile-sheet-body">{settingsPaneInner}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) {
    return modalContent;
  }
  return createPortal(modalContent, document.body);
}
