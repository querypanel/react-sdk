"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  useSyncExternalStore,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  SparklesIcon,
  SendIcon,
  SlidersHorizontalIcon,
  ChevronUpIcon,
} from "lucide-react";
import { DatasourceSelector } from "./DatasourceSelector";
import { PersistedSpecRenderer } from "./generative-ui/PersistedSpecRenderer";
import { createMastraChartChunkHandler } from "./ai-chart-modal/applyMastraChartChunk";
import {
  collectDashboardReportBlocks,
  completeMastraAssistantTurn,
} from "./ai-chart-modal/completeMastraTurn";
import {
  consumeMastraChartStream,
  readHttpErrorMessage,
} from "./ai-chart-modal/mastraChartStream";
import { visualizationFromClassicGenerateChartResponse } from "./ai-chart-modal/classicChartResponse";
import { ReportTurnView } from "./ai-chart-modal/ReportTurnView";
import { findPrecedingUserQuestion } from "./ai-chart-modal/findPrecedingUserQuestion";
import { VizSpecPreview } from "./ai-chart-modal/VizSpecPreview";
import type {
  DashboardReportInsertBlock,
  MastraChartMessage,
  ReportVizBlock,
  SqlExecutionArtifact,
  ToolEvent,
} from "./ai-chart-modal/types";
import "./AIChartModal.css";

/** Unique React list keys; `Date.now()` alone can collide (Strict Mode, same tick). */
function createMessageId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function resolveAiChartTenantFieldName(
  selectedIds: string[],
  byDs: Record<string, string> | null | undefined,
  defaultName: string | null | undefined,
  dashboardType: "customer" | "internal" | undefined,
): string {
  const firstId = selectedIds[0];
  if (firstId && byDs?.[firstId]?.trim()) return byDs[firstId].trim();
  if (defaultName?.trim()) return defaultName.trim();
  return dashboardType === "internal" ? "" : "tenant_id";
}

/** Option for the SQL / chart LLM model selector (OpenAI model id as `value`). */
export type AIChartModelOption = { value: string; label: string };

/** Sensible defaults; override via `chartModelOptions` if your deployment uses different ids. */
export const DEFAULT_AI_CHART_MODEL_OPTIONS: AIChartModelOption[] = [
  { value: "gpt-6-luna", label: "GPT-6 Luna" },
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "", label: "Server default" },
];

export type ChartGenerationEvent =
  | { phase: "ask" }
  | { phase: "result"; result: "success" | "fail"; durationMs: number };

export interface AssistantPanelStatus {
  isLoading: boolean;
  transientStatus: string | null;
  sessionId: string | null;
}

export interface AssistantPanelProps {
  onAddChart: (
    chartSpec: unknown,
    rationale?: string,
    sql?: string,
    datasourceIds?: string[],
    sqlParams?: Record<string, unknown> | null,
    tenantFieldName?: string,
    previewTenantId?: string,
    resultId?: string,
    question?: string
  ) => void;
  /** Insert a multi-block report (text + viz) into the dashboard editor. */
  onAddReport?: (blocks: DashboardReportInsertBlock[]) => void;
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
  /** Whether to render dark theme styles */
  darkMode?: boolean;
  /** When set, only these datasource IDs are shown (e.g. from dashboard.available_datasource_ids). */
  availableDatasourceIds?: string[] | null;
  /** Default tenant field name (e.g. from dashboard.tenant_field_name). */
  defaultTenantFieldName?: string | null;
  /** Per-datasource tenant field name (e.g. from dashboard.tenant_field_by_datasource). Overrides default for the selected datasource. */
  tenantFieldByDatasource?: Record<string, string> | null;
  /** When true, hide tenant field name and preview tenant ID inputs (e.g. in customer embed; tenant comes from JWT only). */
  hideTenantInputs?: boolean;
  /** Whitelabel: empty-state heading (default: "Ask about your data") */
  createTitle?: string;
  /** Model dropdown options (`value` = bare model id; empty string = server default). Server maps tiers when using Gemini. */
  chartModelOptions?: AIChartModelOption[];
  /** Initial selected model `value` (default: `gpt-6-luna`) */
  defaultChartModel?: string;
  /** Host analytics hook. Fired when a chart ask starts and when it succeeds or fails. */
  onChartGeneration?: (event: ChartGenerationEvent) => void;
  /** Called when the user presses Escape in the prompt (the modal closes itself here). */
  onRequestClose?: () => void;
  /** Mirrors loading/session state so a host can render it (e.g. the modal header). */
  onStatusChange?: (status: AssistantPanelStatus) => void;
  /** Focus the prompt on mount (default: true). */
  autoFocus?: boolean;
  /** Increment to focus the prompt on demand (e.g. the Workspace "/" slash item). */
  focusRequest?: number;
}

type Message = MastraChartMessage;

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
 * Mastra stream expects AI Gateway–style `provider/model` (e.g. `openai/gpt-5.6-luna`, `google/gemini-3.6-flash`).
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
function getMessageRationale(message: Message) {
  const rationale = message.rationale?.trim();
  if (rationale) return rationale;

  const content = message.content.trim();
  if (!content || GENERIC_ASSISTANT_SUMMARIES.has(content)) {
    return undefined;
  }

  return content;
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
export function AssistantPanel({
  onAddChart,
  onAddReport,
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
  createTitle: createTitleProp,
  chartModelOptions = DEFAULT_AI_CHART_MODEL_OPTIONS,
  defaultChartModel = "gpt-6-luna",
  onChartGeneration,
  onRequestClose,
  onStatusChange,
  autoFocus = true,
  focusRequest = 0,
}: AssistantPanelProps) {
  const createTitle = createTitleProp ?? "Ask about your data";
  const useMastraStream = isMastraAgentStreamUrl(generateChartWithSqlUrl);
  const enableModelOverride = false;
  const tenantInputsEnabled =
    !hideTenantInputs && dashboardType === "customer";

  const getResolvedTenantField = (
    selectedIds: string[],
    byDs: Record<string, string> | null | undefined,
    defaultName: string | null | undefined
  ) => resolveAiChartTenantFieldName(selectedIds, byDs, defaultName, dashboardType);

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

  const effectiveDarkMode = darkMode;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, transientStatus, toolEvents, lastSqlExecution, activeAssistantMessageId]);

  useEffect(() => {
    if (focusRequest === 0) return;
    // Defer so a pane that was just expanded or opened is visible before it takes focus.
    const timer = setTimeout(() => promptInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [focusRequest]);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => promptInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  useEffect(() => {
    if (initialPrompt && messages.length === 0) {
      setInputValue(initialPrompt);
    }
  }, [initialPrompt, messages.length]);

  useEffect(() => {
    const allowed = new Set(chartModelOptions.map((o) => o.value));
    const next = allowed.has(defaultChartModel)
      ? defaultChartModel
      : (chartModelOptions[0]?.value ?? "");
    setChartModel(next);
  }, [defaultChartModel, chartModelOptions]);

  useEffect(() => {
    onStatusChange?.({ isLoading, transientStatus, sessionId: querypanelSessionId });
  }, [onStatusChange, isLoading, transientStatus, querypanelSessionId]);

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
  }, [isNarrowLayout, mobileSettingsOpen]);

  useEffect(() => {
    setTenantFieldName(
      resolveAiChartTenantFieldName(
        selectedDatasourceIds,
        tenantFieldByDatasource,
        defaultTenantFieldName,
        dashboardType,
      ),
    );
  }, [
    defaultTenantFieldName,
    tenantFieldByDatasource,
    selectedDatasourceIds,
    dashboardType,
  ]);

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

    onChartGeneration?.({ phase: "ask" });
    const startedAt = performance.now();
    const reportResult = (result: "success" | "fail") => {
      onChartGeneration?.({
        phase: "result",
        result,
        durationMs: Math.round(performance.now() - startedAt),
      });
    };

    const userMessage: Message = {
      id: createMessageId("user"),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    const latestResultId = shouldReuseLatestResultId(messageText)
      ? getLatestResultId(messages)
      : undefined;
    const previewTenant = tenantInputsEnabled ? previewTenantId.trim() : "";
    const requestTenantFieldName =
      tenantFieldName.trim() && (dashboardType !== "internal" || previewTenant)
        ? tenantFieldName.trim()
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
            kind: "turn",
            content: "",
            blocks: [],
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
            dashboardId,
            memory: {
              thread: threadId,
              resource: resourceId,
            },
            requestContext: {
              organizationId,
              datasourceId: selectedDatasourceIds[0],
              dashboardId,
              dashboardType,
              ...(latestResultId ? { resultId: latestResultId } : {}),
              ...(!tenantInputsEnabled
                ? {}
                : { tenantId: previewTenant || undefined }),
              ...(requestTenantFieldName
                ? { tenantFieldName: requestTenantFieldName }
                : {}),
            },
            savePerStep: true,
            ...(enableModelOverride && chartModel.trim()
              ? { model: normalizeModelForMastraStreamBody(chartModel) }
              : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(await readHttpErrorMessage(response));
        }
        if (!response.body) {
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
            setLastSqlExecution,
          }),
        );

        // Capture running tools before clearing; do not nest setMessages inside setToolEvents
        // (Strict Mode double-invokes updaters and would duplicate ask blocks).
        let finalizedToolEvents: ToolEvent[] = [];
        setToolEvents((current) => {
          finalizedToolEvents = current.map((event) =>
            event.status === "running"
              ? { ...event, status: "succeeded" as const, endedAt: Date.now() }
              : event,
          );
          return [];
        });
        updateAssistantMessage((msg) =>
          completeMastraAssistantTurn(
            {
              ...msg,
              toolEvents:
                finalizedToolEvents.length > 0
                  ? finalizedToolEvents
                  : msg.toolEvents,
            },
            createMessageId,
          ),
        );
        setTransientStatus(null);
        reportResult("success");
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
            tenantFieldName: requestTenantFieldName,
            ...(!tenantInputsEnabled
              ? {}
              : { previewTenantId: previewTenant || undefined }),
            conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
            ...(querypanelSessionId ? { querypanelSessionId } : {}),
            ...(enableModelOverride && chartModel.trim() ? { model: chartModel.trim() } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(await readHttpErrorMessage(response));
        }

        const data = await response.json();
        const visualization = visualizationFromClassicGenerateChartResponse(data);

        const assistantMessage: Message = {
          id: createMessageId("assistant"),
          role: "assistant",
          content: data.message || "I've created a chart for you!",
          ...visualization,
          rationale: data.rationale,
          sql: data.sql,
          sqlParams: (data.params as Record<string, unknown> | null) ?? null,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setTransientStatus(null);
        if (data.sessionId) setQuerypanelSessionId(data.sessionId);
        reportResult("success");
      }
    } catch (err) {
      console.error("[AssistantPanel] chart generation failed", err);
      reportResult("fail");
      setTransientStatus(null);
      if (!streamFailureHandledRef.current) {
        streamFailureHandledRef.current = true;
        const errorContent =
          err instanceof Error && err.message.trim().length > 0
            ? err.message.trim()
            : "Sorry, I couldn't finish that request. Please try again or rephrase.";
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
          // Keep the in-progress turn (text/data/viz) and attach a visible error ask.
          if (assistantMessageId) {
            const hasTurn = prev.some((m) => m.id === assistantMessageId);
            if (hasTurn) {
              return prev.map((message) => {
                if (message.id !== assistantMessageId) return message;
                const withTools: Message = {
                  ...message,
                  kind: "turn",
                  toolEvents:
                    finalisedToolEvents.length > 0
                      ? finalisedToolEvents
                      : message.toolEvents,
                };
                const completed = completeMastraAssistantTurn(
                  withTools,
                  createMessageId,
                );
                const askAlready =
                  completed.blocks?.some(
                    (b) =>
                      b.type === "ask" &&
                      b.content.toLowerCase().includes(errorContent.toLowerCase().slice(0, 24)),
                  ) ?? false;
                if (askAlready) return completed;
                return {
                  ...completed,
                  blocks: [
                    ...(completed.blocks ?? []),
                    {
                      id: createMessageId("ask-error"),
                      type: "ask" as const,
                      content: errorContent,
                    },
                  ],
                  content:
                    completed.content.trim().length > 0
                      ? completed.content
                      : errorContent,
                };
              });
            }
          }

          const errorMessageId = createMessageId("error");
          if (prev.some((m) => m.id === errorMessageId)) return prev;
          return [
            ...prev,
            {
              id: errorMessageId,
              role: "assistant" as const,
              kind: "turn" as const,
              content: errorContent,
              blocks: [
                {
                  id: createMessageId("ask-error"),
                  type: "ask" as const,
                  content: errorContent,
                },
              ],
              timestamp: new Date(),
              ...(finalisedToolEvents.length > 0
                ? { toolEvents: finalisedToolEvents }
                : {}),
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
      tenantInputsEnabled ? tenantFieldName.trim() || undefined : undefined,
      tenantInputsEnabled ? previewTenantId.trim() || undefined : undefined,
      message.resultId ?? message.queryResult?.resultId,
      findPrecedingUserQuestion(messages, message)
    );
  };

  const handleAddVizBlock = (block: ReportVizBlock, turn?: Message) => {
    onAddChart(
      block.jsonRenderSpec ?? block.chartSpec,
      block.rationale ?? (turn ? getMessageRationale(turn) : undefined),
      block.sql ?? turn?.sql,
      selectedDatasourceIds,
      block.sqlParams ?? turn?.sqlParams ?? null,
      tenantInputsEnabled ? tenantFieldName.trim() || undefined : undefined,
      tenantInputsEnabled ? previewTenantId.trim() || undefined : undefined,
      block.resultId ?? block.queryResult?.resultId ?? turn?.resultId,
      turn ? findPrecedingUserQuestion(messages, turn) : undefined
    );
  };

  const handleAddReportToEditor = (message: Message) => {
    const question = findPrecedingUserQuestion(messages, message);
    const blocks = collectDashboardReportBlocks(message).map((block) => {
      if (block.type !== "viz") return block;
      return {
        ...block,
        question,
        datasourceIds: selectedDatasourceIds,
        tenantFieldName: tenantInputsEnabled
          ? tenantFieldName.trim() || undefined
          : undefined,
        previewTenantId: tenantInputsEnabled
          ? previewTenantId.trim() || undefined
          : undefined,
      };
    });
    if (blocks.length === 0) return;
    if (onAddReport) {
      onAddReport(blocks);
      return;
    }
    // Fallback: add first viz only when host did not wire onAddReport.
    const firstViz = blocks.find((b) => b.type === "viz");
    if (firstViz && firstViz.type === "viz") {
      onAddChart(
        firstViz.jsonRenderSpec ?? firstViz.chartSpec,
        firstViz.rationale ?? getMessageRationale(message),
        firstViz.sql ?? message.sql,
        firstViz.datasourceIds ?? selectedDatasourceIds,
        firstViz.sqlParams ?? message.sqlParams ?? null,
        tenantInputsEnabled
          ? firstViz.tenantFieldName ?? (tenantFieldName.trim() || undefined)
          : undefined,
        tenantInputsEnabled ? firstViz.previewTenantId : undefined,
        firstViz.resultId ?? message.resultId,
        question
      );
    }
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
      onRequestClose?.();
    }
  };

  const tenantSettingsVisible = tenantInputsEnabled;
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
              Tenant field name
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
              Preview as tenant ID
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

  return (
    <div
      className="qp-ai-assistant-panel"
      data-qp-ai-modal
      data-theme={effectiveDarkMode ? "dark" : "light"}
      data-qp-ai-mobile-sheet-open={isNarrowLayout && mobileSettingsOpen ? "true" : undefined}
    >
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
                  const isTurn = message.kind === "turn";
                  // Classic (non-Mastra) replies have no kind; turn UI owns Mastra markdown.
                  const showAssistantMarkdown =
                    message.role === "assistant" &&
                    !isTurn &&
                    message.content.trim().length > 0 &&
                    (!isActiveAssistant || !isLoading || assistantHasVisualization);
                  const hasVisibleAssistantState =
                    isTurn ||
                    message.content.trim().length > 0 ||
                    Boolean(message.jsonRenderSpec) ||
                    Boolean(message.chartSpec) ||
                    Boolean(messageQueryResult) ||
                    Boolean(message.blocks?.length) ||
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
                        {message.role === "user" && message.content.trim().length > 0 && (
                          <div>{message.content}</div>
                        )}

                        {message.role === "assistant" && isTurn && (
                          <ReportTurnView
                            message={message}
                            isActive={isActiveAssistant}
                            isLoading={isLoading}
                            toolEvents={toolEvents}
                            transientStatus={transientStatus}
                            lastSqlExecution={lastSqlExecution}
                            queryResultBaseUrl={queryResultBaseUrl}
                            requestHeaders={headers}
                            darkMode={effectiveDarkMode}
                            datasourceCount={selectedDatasourceIds.length}
                            ThoughtSummaryRail={ThoughtSummaryRail}
                            onAddViz={(block) => handleAddVizBlock(block, message)}
                            onAddReport={handleAddReportToEditor}
                          />
                        )}

                        {message.role === "assistant" &&
                          !isTurn &&
                          Boolean(message.jsonRenderSpec || message.chartSpec) && (
                          <div className="qp-ai-modal-chart-stack">
                            <div className="qp-ai-modal-chart-stack-preview">
                              {message.jsonRenderSpec ? (
                                <JsonRenderPreview
                                  spec={message.jsonRenderSpec}
                                  queryResultBaseUrl={queryResultBaseUrl}
                                  requestHeaders={headers}
                                />
                              ) : (
                                <VizSpecPreview
                                  chartSpec={message.chartSpec}
                                  fallbackRows={
                                    Array.isArray(message.queryResult?.rows)
                                      ? (message.queryResult.rows as Array<Record<string, unknown>>)
                                      : message.id === activeAssistantMessageId
                                        ? (lastSqlExecution?.rows ?? null)
                                        : null
                                  }
                                  darkMode={effectiveDarkMode}
                                  datasourceCount={selectedDatasourceIds.length}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {message.role === "assistant" &&
                          !isTurn &&
                          Boolean(message.jsonRenderSpec || message.chartSpec) && (
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

                        {showAssistantMarkdown && (
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
                    {tenantSettingsVisible
                      ? "Pick where the chart runs and how tenant preview is applied."
                      : "Pick the datasource used to answer your question."}
                  </p>
                  <div className="qp-ai-modal-mobile-sheet-body">{settingsPaneInner}</div>
                </div>
              </div>
            ) : null}
          </div>
    </div>
  );
}
