"use client";

import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";
import { XIcon, SendIcon, LoaderIcon, BarChart3Icon, SparklesIcon } from "lucide-react";
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
import "./AIChartModal.css";

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
  /** Whitelabel: modal title (default: "AI Chart Generator") */
  title?: string;
  /** Whitelabel: empty-state heading (default: "Create a Chart") */
  createTitle?: string;
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
  title: titleProp,
  createTitle: createTitleProp,
}: AIChartModalProps) {
  const modalTitle = titleProp ?? "AI Chart Generator";
  const createTitle = createTitleProp ?? "Create a Chart";

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
  const [querypanelSessionId, setQuerypanelSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tenantFieldId = useId();
  const previewTenantIdFieldId = useId();

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
  }, [messages]);

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
        setQuerypanelSessionId(null);
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
          ...(querypanelSessionId ? { querypanelSessionId } : {}),
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
      if (data.sessionId) setQuerypanelSessionId(data.sessionId);
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

  const modalContent = (
    <div data-qp-ai-modal data-theme={effectiveDarkMode ? "dark" : "light"}>
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
              <button
                type="button"
                onClick={onClose}
                className="qp-ai-modal-close"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="qp-ai-modal-datasource-row">
              <DatasourceSelector
                organizationId={organizationId}
                selectedIds={selectedDatasourceIds}
                onSelectionChange={setSelectedDatasourceIds}
                datasourcesUrl={datasourcesUrl}
                headers={headers}
                darkMode={effectiveDarkMode}
                allowedIds={availableDatasourceIds}
              />
            </div>

            {dashboardType === "customer" && !hideTenantInputs && (
              <div className="qp-ai-modal-grid-2">
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
          </div>

          <div className="qp-ai-modal-body">
            <div className="qp-ai-modal-main">
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
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`qp-ai-modal-msg-row ${message.role === "user" ? "user" : ""}`}
                  >
                    <div className={`qp-ai-modal-msg-bubble ${message.role}`}>
                      <div>{message.content}</div>

                      {Boolean(message.chartSpec) && (
                        <div className="qp-ai-modal-chart-card">
                          <div className="qp-ai-modal-chart-card-head">
                            <div className="qp-ai-modal-chart-card-badge">
                              <BarChart3Icon className="w-3 h-3" style={{ color: "#fff" }} />
                            </div>
                            <span className="qp-ai-modal-chart-card-title">Ready to add</span>
                            <button
                              type="button"
                              onClick={() => handleAddChartToEditor(message)}
                              className="qp-ai-modal-add-chart-btn"
                            >
                              Add Chart
                            </button>
                          </div>
                          <div className="qp-ai-modal-chart-card-preview">
                            <ChartPreview chartSpec={message.chartSpec} darkMode={effectiveDarkMode} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="qp-ai-modal-loading">
                    <LoaderIcon className="qp-ai-modal-spin" style={{ color: "#2563eb", width: 12, height: 12 }} />
                    <span className="qp-ai-modal-loading-text">Thinking...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="qp-ai-modal-footer">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="E.g., 'Show quarterly revenue as a line chart'"
                  className="qp-ai-modal-textarea"
                  rows={1}
                />
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isLoading}
                  className="qp-ai-modal-send"
                >
                  <SendIcon className="w-4 h-4" style={{ color: "#fff" }} />
                </button>
              </div>
            </div>
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
