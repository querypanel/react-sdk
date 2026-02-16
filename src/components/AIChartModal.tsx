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
  /** URL for mock chart generation (default: /api/ai/generate-chart) */
  generateChartUrl?: string;
  /** URL for real SQL chart generation (default: /api/ai/generate-chart-with-sql) */
  generateChartWithSqlUrl?: string;
  /** URL for datasources (default: /api/datasources) */
  datasourcesUrl?: string;
  /** Extra headers for API requests (e.g. x-organization-id is always sent) */
  headers?: Record<string, string>;
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

function ChartPreview({ chartSpec }: { chartSpec: unknown }) {
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
          color: "#dc2626",
          background: "#fef2f2",
          borderRadius: 4,
          border: "1px solid #fecaca",
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

  const dataKey =
    Object.keys(chartData[0]).find((k) => k !== "category" && k !== "date") || "value";
  const categoryKey = (chartData[0] as Record<string, unknown>).category
    ? "category"
    : (chartData[0] as Record<string, unknown>).date
      ? "date"
      : Object.keys(chartData[0])[0];

  const renderChart = () => {
    if (chartType === "pie" || chartType === "arc") {
      return (
        <PieChart>
          <Tooltip />
          <Pie
            data={chartData}
            dataKey={dataKey}
            nameKey={categoryKey}
            cx="50%"
            cy="50%"
            outerRadius={60}
          >
            {chartData.map((entry, index) => {
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
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} stroke={COLORS[0]} strokeWidth={2} dot={false} />
        </LineChart>
      );
    }
    if (chartType === "area") {
      return (
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
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
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
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
  generateChartUrl = "/api/ai/generate-chart",
  generateChartWithSqlUrl = "/api/ai/generate-chart-with-sql",
  datasourcesUrl = "/api/datasources",
  headers = {},
}: AIChartModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDatasourceIds, setSelectedDatasourceIds] = useState<string[]>([]);
  const [useMockData, setUseMockData] = useState(false);
  const [tenantFieldName, setTenantFieldName] = useState("tenant_id");
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
      const endpoint =
        useMockData || selectedDatasourceIds.length === 0
          ? generateChartUrl
          : generateChartWithSqlUrl;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": organizationId,
          ...headers,
        },
        body: JSON.stringify({
          prompt: messageText,
          dashboardId,
          datasourceIds: useMockData ? undefined : selectedDatasourceIds,
          tenantFieldName: tenantFieldName.trim() || undefined,
          previewTenantId: previewTenantId.trim() || undefined,
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
      previewTenantId.trim() || undefined
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
          className="w-full max-w-4xl h-[82vh] bg-white dark:bg-gray-950 rounded-xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-800 pointer-events-auto overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/30 dark:via-purple-950/30 dark:to-pink-950/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <SparklesIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    AI Chart Generator
                  </h2>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Describe your visualization in natural language
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 p-0 rounded hover:bg-white/80 dark:hover:bg-gray-800 flex items-center justify-center"
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
              />
              <label className="text-sm text-muted-foreground flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useMockData}
                  onChange={(e) => setUseMockData(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Use mock data
              </label>
            </div>

            {dashboardType === "customer" && (
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
                            <ChartPreview chartSpec={message.chartSpec} />
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
