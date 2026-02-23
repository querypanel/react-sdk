"use client";

import { useState, useRef, useEffect } from "react";
import {
  XIcon,
  SendIcon,
  LoaderIcon,
  BarChart3Icon,
  LineChartIcon,
  PieChartIcon,
  AreaChartIcon,
  TrendingUpIcon,
  ActivityIcon,
  SparklesIcon,
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
import { formatTimestampForDisplay } from "../utils/formatters";

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
    previewTenantId?: string
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
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chartSpec?: unknown;
  rationale?: string;
  sql?: string;
  sqlParams?: Record<string, unknown> | null;
  timestamp: Date;
};

const quickPrompts = [
  { icon: BarChart3Icon, text: "Show sales by region", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
  { icon: LineChartIcon, text: "User growth over time", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
  { icon: PieChartIcon, text: "Revenue by product category", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/20" },
  { icon: TrendingUpIcon, text: "Monthly conversion rates", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/20" },
  { icon: ActivityIcon, text: "Daily active users", color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/20" },
  { icon: AreaChartIcon, text: "Customer retention cohort", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/20" },
];

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
const EMPTY_HEADERS: Record<string, string> = {};

function isNumericChartValue(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) return true;
  return false;
}

function ChartPreview({
  chartSpec,
  darkMode = false,
}: {
  chartSpec: unknown;
  darkMode?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  let chartType = "bar";
  let chartData: Record<string, unknown>[] = [];

  try {
    const spec = typeof chartSpec === "string" ? JSON.parse(chartSpec) : chartSpec;

    if (spec.kind === "chart") {
      chartType = spec.encoding?.chartType || "bar";
      chartData = spec.data || [];
    } else {
      chartType = spec.mark?.type || spec.mark || "bar";
      chartData = spec.data?.values || [];
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to render chart");
  }

  if (error || !chartData || chartData.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: darkMode ? "#fca5a5" : "#dc2626",
          background: darkMode ? "rgba(239,68,68,0.18)" : "#fef2f2",
          borderRadius: 4,
          border: darkMode ? "1px solid rgba(239,68,68,0.35)" : "1px solid #fecaca",
          padding: 8,
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
  const spec = typeof chartSpec === "string" ? JSON.parse(chartSpec as string) : chartSpec;
  const encoding = spec?.kind === "chart" ? spec.encoding : null;
  const xField = encoding?.x?.field;
  const yField = encoding?.y?.field;
  const yType = encoding?.y?.type;
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

  const renderChart = () => {
    const data = chartDataNormalized;
    if (chartType === "pie" || chartType === "arc") {
      return (
        <PieChart>
          <Tooltip formatter={(value, name) => [formatTimestampForDisplay(value), name]} />
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={categoryKey}
            cx="50%"
            cy="50%"
            outerRadius={60}
            label={({ name }) => formatTimestampForDisplay(name)}
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
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} tickFormatter={formatTimestampForDisplay} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value, name) => [formatTimestampForDisplay(value), name]} />
          <Line type="monotone" dataKey={dataKey} stroke={COLORS[0]} strokeWidth={2} dot={false} />
        </LineChart>
      );
    }
    if (chartType === "area") {
      return (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} tickFormatter={formatTimestampForDisplay} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value, name) => [formatTimestampForDisplay(value), name]} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={COLORS[0]}
            fill={COLORS[0]}
            fillOpacity={0.6}
          />
        </AreaChart>
      );
    }
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} tickFormatter={formatTimestampForDisplay} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value, name) => [formatTimestampForDisplay(value), name]} />
        <Bar dataKey={dataKey} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    );
  };

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
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
  darkMode = false,
  availableDatasourceIds,
  defaultTenantFieldName,
  tenantFieldByDatasource,
  hideTenantInputs = false,
}: AIChartModalProps) {
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
  const [selectedDatasourceIds, setSelectedDatasourceIds] = useState<string[]>([]);
  const [tenantFieldName, setTenantFieldName] = useState(() =>
    getResolvedTenantField([], tenantFieldByDatasource, defaultTenantFieldName)
  );
  const [previewTenantId, setPreviewTenantId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialPrompt && messages.length === 0) {
      setInputValue(initialPrompt);
    }
  }, [isOpen, initialPrompt, messages.length]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setMessages([]);
        setInputValue("");
        setIsLoading(false);
      }, 300);
    }
  }, [isOpen]);

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

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
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
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate chart");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message || "I've created a chart for you!",
        chartSpec: data.chartSpec,
        rationale: data.rationale,
        sql: data.sql,
        sqlParams: (data.params as Record<string, unknown> | null) ?? null,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content:
          "Sorry, I couldn't generate that chart. Please try again or rephrase your request.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChartToEditor = (message: Message) => {
    onAddChart(
      message.chartSpec,
      message.rationale,
      message.sql,
      selectedDatasourceIds,
      message.sqlParams,
      tenantFieldName.trim() || undefined,
      hideTenantInputs ? undefined : previewTenantId.trim() || undefined
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 bg-black/60 z-50 animate-in fade-in-0 duration-200 cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div
          className={`w-full max-w-4xl h-[82vh] bg-white dark:bg-gray-950 rounded-xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-800 pointer-events-auto overflow-hidden ${darkMode ? "dark" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div
            className={`px-5 py-3 border-b space-y-3 ${
              darkMode
                ? "border-gray-800 bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-pink-950/40"
                : "border-gray-200 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <SparklesIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2
                    className={`text-base font-semibold ${
                      darkMode ? "text-gray-100" : "text-gray-900"
                    }`}
                  >
                    AI Chart Generator
                  </h2>
                  <p
                    className={`text-xs ${
                      darkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Describe your visualization in natural language
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`h-8 w-8 p-0 rounded flex items-center justify-center ${
                  darkMode
                    ? "hover:bg-gray-800 text-gray-300"
                    : "hover:bg-white/80 text-gray-700"
                }`}
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <DatasourceSelector
                organizationId={organizationId}
                selectedIds={selectedDatasourceIds}
                onSelectionChange={setSelectedDatasourceIds}
                datasourcesUrl={datasourcesUrl}
                headers={headers}
                darkMode={darkMode}
                allowedIds={availableDatasourceIds}
              />
            </div>

            {dashboardType === "customer" && !hideTenantInputs && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ai-modal-tenant-field" className="text-xs text-muted-foreground">
                    Tenant field name (optional)
                  </label>
                  <input
                    id="ai-modal-tenant-field"
                    type="text"
                    value={tenantFieldName}
                    onChange={(e) => setTenantFieldName(e.target.value)}
                    placeholder="tenant_id"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ai-modal-preview-tenant" className="text-xs text-muted-foreground">
                    Preview as tenant ID (optional)
                  </label>
                  <input
                    id="ai-modal-preview-tenant"
                    type="text"
                    value={previewTenantId}
                    onChange={(e) => setPreviewTenantId(e.target.value)}
                    placeholder="tenant_a"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Two Column Layout */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-800">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-md">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center">
                        <SparklesIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Create a Chart
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Choose a quick start option or describe your own visualization
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      className={`flex-1 space-y-2 ${
                        message.role === "user" ? "flex flex-col items-end" : ""
                      }`}
                    >
                      <div
                        className={`inline-block px-4 py-2 rounded-lg text-sm max-w-[90%] ${
                          message.role === "assistant"
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {message.content}
                      </div>

                      {Boolean(message.chartSpec) && (
                        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2 max-w-[90%]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                                <BarChart3Icon className="w-3 h-3 text-white" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Ready to add
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddChartToEditor(message)}
                              className="h-7 px-3 text-xs font-medium rounded bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                            >
                              Add Chart
                            </button>
                          </div>
                          <div className="bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800 p-2 overflow-hidden">
                            <ChartPreview chartSpec={message.chartSpec} darkMode={darkMode} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <LoaderIcon className="w-3 h-3 animate-spin text-blue-600" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-gray-200 dark:border-gray-800">
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="E.g., 'Show quarterly revenue as a line chart'"
                    className="flex-1 min-h-[40px] max-h-32 resize-none text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isLoading}
                    className="h-[40px] w-[40px] p-0 rounded bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shrink-0 flex items-center justify-center disabled:opacity-50"
                  >
                    <SendIcon className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>

            <div className="w-64 bg-gray-50 dark:bg-gray-900/50 p-3 overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                Quick Start
              </h3>
              <div className="space-y-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt.text}
                    type="button"
                    onClick={() => handleSendMessage(prompt.text)}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-800 text-left transition-all hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-700 ${prompt.bg} ${
                      isLoading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shrink-0">
                      <prompt.icon className={`w-4 h-4 ${prompt.color}`} />
                    </div>
                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">
                      {prompt.text}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Be specific about data, chart type, and styling for best results
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
