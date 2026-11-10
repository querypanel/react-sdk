"use client";

import {
  useState,
  useRef,
  useEffect,
  useId,
  useMemo,
  useCallback,
} from "react";
import {
  SparklesIcon,
  SendIcon,
  ArrowUpIcon,
  LoaderCircleIcon,
  DatabaseIcon,
  HistoryIcon,
  PlusIcon,
  CpuIcon,
} from "lucide-react";
import { DatasourceSelector } from "./DatasourceSelector";
import { useElementWidth } from "./useElementWidth";
import { NarrowLayoutContext } from "./ai-chart-modal/narrowLayoutContext";
import { ThemeProvider } from "../context/ThemeContext";
import {
  ChatMarkdown,
  JsonRenderPreview,
} from "./ai-chart-modal/ChatPrimitives";
import {
  getLatestResultId,
  getMessageRationale,
  shouldReuseLatestResultId,
} from "./ai-chart-modal/chatMessageHelpers";
import { createMastraChartChunkHandler } from "./ai-chart-modal/applyMastraChartChunk";
import {
  collectDashboardReportBlocks,
  completeMastraAssistantTurn,
} from "./ai-chart-modal/completeMastraTurn";
import {
  consumeMastraChartStream,
  resolveAssistantTransport,
  type AssistantTransport,
  readHttpErrorMessage,
} from "./ai-chart-modal/mastraChartStream";
import { visualizationFromClassicGenerateChartResponse } from "./ai-chart-modal/classicChartResponse";
import { ReportTurnView } from "./ai-chart-modal/ReportTurnView";
import { pendingSelectedVizIds, selectableTurn } from "./ai-chart-modal/selectionBar";
import { ModeSegment, PlanTrack, SelectionTray } from "./ai-chart-modal/CommandDeck";
import { withDerivedPlanProgress } from "./ai-chart-modal/planProgress";
import {
  decideReportMode,
  parseStoredPreference,
  type ReportPreference,
} from "./ai-chart-modal/reportRouting";
import { findPrecedingUserQuestion } from "./ai-chart-modal/findPrecedingUserQuestion";
import { VizSpecPreview } from "./ai-chart-modal/VizSpecPreview";
import { useMapGeoClient } from "./blocks/mapGeo";
import type {
  DashboardReportInsertBlock,
  MastraChartMessage,
  ReportVizBlock,
  SqlExecutionArtifact,
  ToolEvent,
} from "./ai-chart-modal/types";
import { ChartChip, ChartTagPicker } from "./ai-chart-modal/ChartTagUi";
import { ChartChangeCard, type ChartChangeState } from "./ai-chart-modal/ChartChangeCard";
import {
  fetchTagIntent,
  NEEDS_SINGLE_CHART_MESSAGE,
} from "./ai-chart-modal/tagIntent";
import { settleRunningTools, withStreamFailure } from "./ai-chart-modal/streamFailure";
import { threadTitleFromQuestion } from "./ai-chart-modal/assistantThreads";
import { useAssistantThreads } from "./ai-chart-modal/useAssistantThreads";
import {
  buildChartBlockInput,
  type ChartBlockSummary,
  type ChartPayload,
} from "./dashboardEditorController";
import {
  buildChartRefMap,
  buildDashboardContext,
  chartLabel,
  detectMention,
  findChangeTarget,
  nextIntent,
  summarizeChartChange,
  type ChartBlockSnapshot,
  type ChartChangeMode,
  TAG_INTENT_LABELS,
  type TagIntent,
  filterChartsForPicker,
  removeMention,
  resolveChartRef,
  resolveDatasourceId,
  resolveTags,
  validateTagsForSend,
} from "./workspaceState";
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
  /** Report mode is available (Workspace): shows the Report toggle and the add-to-dashboard bar. */
  reportMode?: boolean;
  organizationId: string;
  dashboardId: string;
  initialPrompt?: string;
  dashboardType?: "customer" | "internal";
  /** URL for SQL chart generation (default: /api/ai/generate-chart-with-sql) */
  generateChartWithSqlUrl?: string;
  /** How that URL answers. Defaults to "stream" for `/api/agents/<id>/stream` URLs, else "json". */
  assistantTransport?: AssistantTransport;
  /** URL for datasources (default: /api/datasources) */
  datasourcesUrl?: string;
  /** Extra headers for API requests (e.g. x-organization-id is always sent) */
  headers?: Record<string, string>;
  /** URL for result artifact fetches used by json-render previews */
  queryResultBaseUrl?: string;
  /** Base URL of the geo routes a map answer draws with. Overrides the surrounding MapGeoProvider (default: /api/geo). */
  geoBaseUrl?: string;
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
  /** Charts on the Dashboard. When set, `@` in the prompt tags a chart. Omit to disable tagging. */
  charts?: ChartBlockSummary[];
  /** Chip click: scroll to and highlight the chart's block (by block id). */
  onChartChipClick?: (blockId: string) => void;
  /**
   * Assistant Threads endpoint (e.g. `/api/assistant-threads`). When set, the conversation is
   * stored per user and Dashboard: it is restored on reload and can be restarted or switched.
   */
  threadsUrl?: string;
  /** Run-sql URL used to redraw chart previews of a restored Thread (default: /api/dashboards/run-sql). */
  runSqlUrl?: string;
  /** Tag a chart in the composer and focus it (the Dashboard's "Ask about this"). Bump `nonce` per request. */
  tagRequest?: { chartId: string; nonce: number };
  /** Tag-intent endpoint (e.g. `/api/ai/tag-intent`). When set, tagged messages get an intent (investigate/modify/replace). */
  tagIntentUrl?: string;
  /** Snapshot of a Dashboard chart by chart id (spec, SQL, params). Replaces `getChartSpec`. */
  getChartSnapshot?: (chartId: string) => ChartBlockSnapshot | undefined;
  /**
   * Apply a proposed change to a tagged chart as one editor transaction (modify keeps the chart
   * id, replace assigns a new one). Returns false when the chart is gone. Never saves.
   */
  onApplyChartChange?: (change: {
    chartId: string;
    mode: ChartChangeMode;
    payload: ChartPayload;
  }) => boolean;
}

type Message = MastraChartMessage;

const EMPTY_HEADERS: Record<string, string> = {};

/** 52rem at the default 16px root; keep in sync with the `@container qp-ai-panel` rules in AIChartModal.css. */
const AI_PANEL_NARROW_MAX_WIDTH_PX = 832;

const REPORT_MODE_STORAGE_KEY = "qp-ai-report-mode";

export function AssistantPanel({
  onAddChart,
  onAddReport,
  reportMode = false,
  organizationId,
  dashboardId,
  initialPrompt,
  dashboardType = "customer",
  generateChartWithSqlUrl = "/api/ai/generate-chart-with-sql",
  assistantTransport,
  datasourcesUrl = "/api/datasources",
  headers = EMPTY_HEADERS,
  queryResultBaseUrl = "/api/query-results",
  geoBaseUrl,
  darkMode = false,
  availableDatasourceIds,
  defaultTenantFieldName,
  tenantFieldByDatasource,
  hideTenantInputs = false,
  createTitle: createTitleProp,
  chartModelOptions = DEFAULT_AI_CHART_MODEL_OPTIONS,
  onChartGeneration,
  onRequestClose,
  onStatusChange,
  autoFocus = true,
  focusRequest = 0,
  charts,
  onChartChipClick,
  threadsUrl,
  runSqlUrl = "/api/dashboards/run-sql",
  tagRequest,
  tagIntentUrl,
  getChartSnapshot,
  onApplyChartChange,
}: AssistantPanelProps) {
  const createTitle = createTitleProp ?? "Ask about your data";
  const useMastraStream =
    resolveAssistantTransport(generateChartWithSqlUrl, assistantTransport) === "stream";
  const mapGeo = useMapGeoClient({ geoBaseUrl, headers, organizationId });
  const tenantInputsEnabled =
    !hideTenantInputs && dashboardType === "customer";

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [taggedChartIds, setTaggedChartIds] = useState<string[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);
  const taggingEnabled = charts !== undefined;
  const mention = taggingEnabled ? detectMention(inputValue) : null;
  const pickerOptions = mention ? filterChartsForPicker(charts ?? [], mention.query) : [];
  const chartLabelFor = (chartId: string) => {
    const index = (charts ?? []).findIndex((chart) => chart.chartId === chartId);
    return index >= 0 ? chartLabel((charts ?? [])[index]!, index) : "Removed chart";
  };
  const [sendError, setSendError] = useState<string | null>(null);
  const [decidingIntent, setDecidingIntent] = useState(false);
  const [changeStates, setChangeStates] = useState<Record<string, ChartChangeState>>({});
  /** Report cards: explicit checkbox overrides (default checked) and charts already added, by viz block id. */
  const [vizSelected, setVizSelected] = useState<Record<string, boolean>>({});
  const [vizAdded, setVizAdded] = useState<Record<string, boolean>>({});
  const markVizAdded = (ids: string[]) =>
    setVizAdded((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, true])) }));
  /** A message waiting for the user to pick its intent (both deciders failed or were unsure). */
  const [pendingIntent, setPendingIntent] = useState<{
    text: string;
    tagIds: string[];
    options: TagIntent[];
  } | null>(null);
  const selectTag = (chartId: string) => {
    setSendError(null);
    setTaggedChartIds((prev) => (prev.includes(chartId) ? prev : [...prev, chartId]));
    setInputValue((prev) => removeMention(prev));
    setPickerIndex(0);
    promptInputRef.current?.focus();
  };
  const authHeaders = { "x-organization-id": organizationId, ...headers };
  const resetConversation = (next: Message[]) => {
    setMessages(next);
    setTaggedChartIds([]);
    setInputValue("");
    setToolEvents([]);
    setLastSqlExecution(null);
    setActiveAssistantMessageId(null);
    setQuerypanelSessionId(null);
  };

  /** Re-run a restored chart's SQL as the signed-in admin; null when it cannot be run. */
  const runSqlForRestoredChart = async (chart: ReportVizBlock): Promise<SqlExecutionArtifact | null> => {
    const datasourceId = chart.datasourceId ?? selectedDatasourceIds[0];
    if (!chart.sql || !datasourceId) return null;
    const previewTenant = tenantInputsEnabled ? previewTenantId.trim() : "";
    const tenantField = tenantInputsEnabled ? tenantFieldName.trim() : "";
    const response = await fetch(runSqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        sql: chart.sql,
        datasourceIds: [datasourceId],
        dashboardId,
        params: chart.sqlParams ?? {},
        ...(tenantField ? { tenantFieldName: tenantField } : {}),
        ...(previewTenant ? { previewTenantId: previewTenant } : {}),
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { rows?: unknown; fields?: unknown };
    const rows = Array.isArray(payload.rows) ? (payload.rows as Array<Record<string, unknown>>) : [];
    const fields = Array.isArray(payload.fields)
      ? (payload.fields as unknown[]).filter((f): f is string => typeof f === "string")
      : rows[0]
        ? Object.keys(rows[0])
        : [];
    return { resultId: chart.resultId, fields, rows, rowCount: rows.length };
  };

  const {
    threadsClient,
    threads,
    setThreads,
    activeThread,
    setActiveThread,
    threadsError,
    threadsLoading,
    openThread,
    startNewConversation,
  } = useAssistantThreads({
    threadsUrl,
    dashboardId,
    headers: authHeaders,
    runSqlForRestoredChart,
    onRestore: (restored, thread) => {
      resetConversation(restored);
      setQuerypanelSessionId(thread.mastra_thread_id);
    },
    onReset: () => resetConversation([]),
  });

  const chipClickHandler = (chartId: string) => {
    const chart = (charts ?? []).find((candidate) => candidate.chartId === chartId);
    return chart && onChartChipClick ? () => onChartChipClick(chart.id) : undefined;
  };
  const [isLoading, setIsLoading] = useState(false);
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const [selectedDatasourceIds, setSelectedDatasourceIds] = useState<string[]>([]);
  const [tenantFieldName, setTenantFieldName] = useState(() =>
    resolveAiChartTenantFieldName([], tenantFieldByDatasource, defaultTenantFieldName, dashboardType)
  );
  const [previewTenantId, setPreviewTenantId] = useState("");
  /** Tenant inputs as sent to the API: only for customer Dashboards, empty means unset. */
  const scopedTenantField = tenantInputsEnabled ? tenantFieldName.trim() || undefined : undefined;
  const scopedPreviewTenant = tenantInputsEnabled ? previewTenantId.trim() || undefined : undefined;
  const [querypanelSessionId, setQuerypanelSessionId] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null);
  const [lastSqlExecution, setLastSqlExecution] = useState<SqlExecutionArtifact | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const tenantFieldId = useId();
  const previewTenantIdFieldId = useId();
  const chartModelId = useId();
  const planPanelId = useId();
  const historyPopupId = useId();
  const dataPopupId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const dataTriggerRef = useRef<HTMLButtonElement>(null);
  /** Prevents duplicate error rows when catch runs more than once (e.g. React Strict Mode). */
  const streamFailureHandledRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelWidth = useElementWidth(panelRef);
  const isNarrowLayout = panelWidth !== null && panelWidth <= AI_PANEL_NARROW_MAX_WIDTH_PX;
  /** Compact layout: which composer toolbar popup is open. */
  const [openPopup, setOpenPopup] = useState<"history" | "data" | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [reportPreference, setReportPreference] = useState<ReportPreference>("auto");
  useEffect(() => {
    try {
      setReportPreference(parseStoredPreference(window.localStorage.getItem(REPORT_MODE_STORAGE_KEY)));
    } catch {
      // private mode / blocked storage: keep the default
    }
  }, []);
  const selectReportPreference = (next: ReportPreference) => {
    setReportPreference(next);
    try {
      window.localStorage.setItem(REPORT_MODE_STORAGE_KEY, next);
    } catch {
      // not persisted
    }
  };
  const [datasourceNames, setDatasourceNames] = useState<Record<string, string>>({});
  const handleDatasourcesLoaded = useCallback(
    (list: Array<{ id: string; name: string }>) =>
      setDatasourceNames(Object.fromEntries(list.map((ds) => [ds.id, ds.name]))),
    [],
  );


  useEffect(() => {
    // Scroll only the messages list; scrollIntoView would also scroll the host page.
    const el = messagesRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
    onStatusChange?.({ isLoading, transientStatus, sessionId: querypanelSessionId });
  }, [onStatusChange, isLoading, transientStatus, querypanelSessionId]);

  useEffect(() => {
    if (!isNarrowLayout) setOpenPopup(null);
  }, [isNarrowLayout]);

  // Escape or a click outside the toolbar closes the open popup.
  useEffect(() => {
    if (!openPopup) return;
    const trigger = openPopup === "history" ? historyTriggerRef : dataTriggerRef;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpenPopup(null);
      trigger.current?.focus({ preventScroll: true });
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setOpenPopup(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [openPopup]);

  // The newest turn's plan is pinned above the composer: open while it runs, collapsed once finished.
  const pinnedPlanMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === "assistant") return messages[i]!.plan?.length ? messages[i]! : null;
    }
    return null;
  }, [messages]);
  const pinnedPlanId = pinnedPlanMessage?.id ?? null;
  const selectionTurn = selectableTurn(messages, reportMode);
  const selectionPendingIds = selectionTurn
    ? pendingSelectedVizIds(selectionTurn, (id) => vizSelected[id] ?? true, (id) => Boolean(vizAdded[id]))
    : [];
  const pinnedPlanRunning = pinnedPlanId !== null && isLoading && pinnedPlanId === activeAssistantMessageId;
  useEffect(() => {
    setPlanOpen(pinnedPlanRunning);
  }, [pinnedPlanId, pinnedPlanRunning]);

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

  useEffect(() => {
    if (!tagRequest) return;
    selectTag(tagRequest.chartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagRequest?.nonce]);

  const handleSendMessage = async (
    prompt?: string,
    opts?: { taggedChartIds?: string[]; intent?: TagIntent },
  ) => {
    const messageText = prompt || inputValue.trim();
    if (!messageText || isLoading || decidingIntent) return;
    const tagIds = opts?.taggedChartIds ?? taggedChartIds;
    const tagError = taggingEnabled ? validateTagsForSend(tagIds, charts ?? []) : null;
    if (tagError) {
      setSendError(tagError);
      return;
    }
    setSendError(null);
    streamFailureHandledRef.current = false;
    const { resolved: taggedCharts } = resolveTags(tagIds, charts ?? []);
    const runAsReport =
      reportMode &&
      decideReportMode({
        text: messageText,
        preference: reportPreference,
        hasTaggedCharts: taggedCharts.length > 0,
        hasPriorTurns: messages.some((m) => m.role === "assistant"),
      });
    const requestDatasourceId = resolveDatasourceId(taggedCharts, selectedDatasourceIds[0]);
    const taggedHasDatasource = taggedCharts.some((chart) => chart.datasourceIds.length > 0);
    if (useMastraStream && !taggedHasDatasource && selectedDatasourceIds.length !== 1) {
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

    let intent = opts?.intent;
    let needsSingleChart = false;
    if (taggedCharts.length > 0 && tagIntentUrl && !intent) {
      setDecidingIntent(true);
      const decision = await fetchTagIntent(
        tagIntentUrl,
        authHeaders,
        {
          question: messageText,
          tagged: taggedCharts.map((chart) => ({
            title: chart.title,
            sql: chart.sql,
            kind: chart.presentationKind,
          })),
        },
      );
      setDecidingIntent(false);
      if (decision.intent === "ask") {
        setPendingIntent({ text: messageText, tagIds, options: decision.options ?? ["investigate"] });
        return;
      }
      intent = decision.intent;
      needsSingleChart = decision.needsSingleChart === true;
    }
    setPendingIntent(null);

    if (needsSingleChart) {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId("user"),
          role: "user",
          content: messageText,
          timestamp: new Date(),
          intent,
          taggedCharts: taggedCharts.map((chart) => ({
            chartId: chart.chartId,
            label: chartLabelFor(chart.chartId),
          })),
        },
        {
          id: createMessageId("assistant"),
          role: "assistant",
          content: NEEDS_SINGLE_CHART_MESSAGE,
          timestamp: new Date(),
        },
      ]);
      setInputValue("");
      setTaggedChartIds([]);
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
      ...(intent ? { intent } : {}),
      ...(taggedCharts.length > 0
        ? {
            taggedCharts: taggedCharts.map((chart) => ({
              chartId: chart.chartId,
              label: chartLabelFor(chart.chartId),
            })),
          }
        : {}),
    };
    const dashboardContext = taggingEnabled
      ? buildDashboardContext(
          charts ?? [],
          tagIds,
          (id) => {
            const snapshot = getChartSnapshot?.(id);
            return snapshot?.jsonRenderSpec ?? snapshot?.chartSpec;
          },
          intent,
          (id) => getChartSnapshot?.(id)?.params,
        )
      : undefined;

    const latestResultId = shouldReuseLatestResultId(messageText)
      ? getLatestResultId(messages)
      : undefined;
    const previewTenant = tenantInputsEnabled ? previewTenantId.trim() : "";
    // A tagged chart's datasource may differ from the chat's selection, so resolve its tenant field.
    const requestTenantField =
      requestDatasourceId && requestDatasourceId !== selectedDatasourceIds[0]
        ? resolveAiChartTenantFieldName(
            [requestDatasourceId],
            tenantFieldByDatasource,
            defaultTenantFieldName,
            dashboardType,
          )
        : tenantFieldName;
    const requestTenantFieldName =
      requestTenantField.trim() && (dashboardType !== "internal" || previewTenant)
        ? requestTenantField.trim()
        : undefined;

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setTaggedChartIds([]);
    setIsLoading(true);
    setTransientStatus("Thinking");
    setToolEvents([]);
    setLastSqlExecution(null);
    let assistantMessageId: string | null = null;

    try {
      if (useMastraStream) {
        let thread = activeThread;
        if (threadsClient && !thread) {
          thread = await threadsClient.create(threadTitleFromQuestion(messageText));
          setActiveThread(thread);
          setThreads((prev) => [thread!, ...prev]);
        }
        const threadId =
          thread?.mastra_thread_id ||
          querypanelSessionId ||
          createMessageId(`chart-${dashboardId}`);
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
            ...(dashboardContext ? { chartRefs: buildChartRefMap(dashboardContext) } : {}),
          },
        ]);
        setQuerypanelSessionId(threadId);

        const response = await fetch(generateChartWithSqlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            messages: messageText,
            dashboardId,
            memory: {
              thread: threadId,
              resource: resourceId,
            },
            requestContext: {
              organizationId,
              datasourceId: requestDatasourceId,
              dashboardId,
              dashboardType,
              ...(runAsReport ? { reportMode: true } : {}),
              ...(dashboardContext ? { dashboardContext } : {}),
              ...(latestResultId ? { resultId: latestResultId } : {}),
              ...(!tenantInputsEnabled
                ? {}
                : { tenantId: previewTenant || undefined }),
              ...(requestTenantFieldName
                ? { tenantFieldName: requestTenantFieldName }
                : {}),
            },
            savePerStep: true,
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
          finalizedToolEvents = settleRunningTools(current, { status: "succeeded" });
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
          headers: { "Content-Type": "application/json", ...authHeaders },
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
          finalisedToolEvents = settleRunningTools(current, { status: "failed", error: "Failed" });
          return [];
        });
        setMessages((prev) =>
          withStreamFailure(prev, assistantMessageId, errorContent, finalisedToolEvents, createMessageId),
        );
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
      scopedTenantField,
      scopedPreviewTenant,
      message.resultId ?? message.queryResult?.resultId,
      findPrecedingUserQuestion(messages, message)
    );
  };

  const handleAddVizBlock = (block: ReportVizBlock, turn?: Message) => {
    markVizAdded([block.id]);
    onAddChart(
      block.jsonRenderSpec ?? block.chartSpec,
      block.rationale ?? (turn ? getMessageRationale(turn) : undefined),
      block.sql ?? turn?.sql,
      block.datasourceId ? [block.datasourceId] : selectedDatasourceIds,
      block.sqlParams ?? turn?.sqlParams ?? null,
      scopedTenantField,
      scopedPreviewTenant,
      block.resultId ?? block.queryResult?.resultId ?? turn?.resultId,
      turn ? findPrecedingUserQuestion(messages, turn) : undefined
    );
  };

  /** Whole report (text + charts), or only `onlyVizIds` charts without text. */
  const handleAddReportToEditor = (message: Message, onlyVizIds?: string[]) => {
    const question = findPrecedingUserQuestion(messages, message);
    const blocks = collectDashboardReportBlocks(
      message,
      onlyVizIds ? new Set(onlyVizIds) : undefined
    ).map((block) => {
      if (block.type !== "viz") return block;
      return {
        ...block,
        question,
        datasourceIds: block.datasourceIds ?? selectedDatasourceIds,
        tenantFieldName: scopedTenantField,
        previewTenantId: scopedPreviewTenant,
      };
    });
    if (blocks.length === 0) return;
    markVizAdded(
      onlyVizIds ??
        (message.blocks ?? []).filter((b) => b.type === "viz").map((b) => b.id)
    );
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

  /** Badge click: drop this turn and ask again with the next intent. */
  const rerunWithIntent = (userMessage: Message, nextTagIntent: TagIntent) => {
    const tagIds = (userMessage.taggedCharts ?? []).map((tag) => tag.chartId);
    setMessages((prev) => {
      const start = prev.findIndex((m) => m.id === userMessage.id);
      if (start < 0) return prev;
      let end = start + 1;
      while (end < prev.length && prev[end]!.role !== "user") end += 1;
      return [...prev.slice(0, start), ...prev.slice(end)];
    });
    void handleSendMessage(userMessage.content, { taggedChartIds: tagIds, intent: nextTagIntent });
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mention && pickerOptions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setPickerIndex((i) => (i + step + pickerOptions.length) % pickerOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectTag(pickerOptions[Math.min(pickerIndex, pickerOptions.length - 1)]!.chart.chartId);
        return;
      }
    }
    if (mention && e.key === "Escape") {
      e.preventDefault();
      setInputValue((prev) => removeMention(prev));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Escape") {
      onRequestClose?.();
    }
  };

  const pinnedPlanSteps = isNarrowLayout
    ? withDerivedPlanProgress(
        pinnedPlanMessage?.plan ?? [],
        (pinnedPlanMessage?.blocks ?? []).filter((block) => block.type === "viz").length,
        pinnedPlanRunning,
      )
    : [];

  const datasourceSummaryShort =
    selectedDatasourceIds.length === 0
      ? "Choose a datasource"
      : selectedDatasourceIds.length === 1
        ? "1 datasource selected"
        : `${selectedDatasourceIds.length} datasources selected`;

  const datasourceChipLabel =
    selectedDatasourceIds.length === 0
      ? "Choose data"
      : selectedDatasourceIds.length === 1
        ? (datasourceNames[selectedDatasourceIds[0]!] ?? "1 source")
        : `${selectedDatasourceIds.length} sources`;

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
          darkMode={darkMode}
          allowedIds={availableDatasourceIds}
          onDatasourcesLoaded={handleDatasourcesLoaded}
          fullWidth
        />
      </div>

      {tenantInputsEnabled && (
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
    <NarrowLayoutContext.Provider value={isNarrowLayout}>
    <ThemeProvider darkMode={darkMode}>
    <div
      ref={panelRef}
      className="qp-ai-assistant-panel"
      data-qp-ai-modal
      data-theme={darkMode ? "dark" : "light"}
    >
          <div
            className={`qp-ai-modal-body qp-ai-modal-body-split${isNarrowLayout ? " qp-ai-modal-body-narrow" : ""}`}
          >
            <div className="qp-ai-modal-chat-pane">
              {threadsClient && !isNarrowLayout && (
                <div className="qp-ai-thread-bar">
                  <select
                    className="qp-ai-thread-select"
                    aria-label="Conversation"
                    value={activeThread?.id ?? ""}
                    disabled={isLoading || threadsLoading}
                    onChange={(e) => {
                      const next = threads.find((thread) => thread.id === e.target.value);
                      if (next) void openThread(next);
                    }}
                  >
                    {!activeThread && <option value="">New conversation</option>}
                    {threads.map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="qp-ai-thread-new"
                    disabled={isLoading || threadsLoading || (!activeThread && messages.length === 0)}
                    onClick={startNewConversation}
                  >
                    New conversation
                  </button>
                </div>
              )}
              {threadsError && (
                <div className="qp-ai-thread-error" role="alert">
                  {threadsError}
                </div>
              )}
              <div ref={messagesRef} className="qp-ai-modal-messages">
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
                        {message.role === "user" && (message.taggedCharts || message.intent) && (
                          <div className="qp-ai-tag-row">
                            {(message.taggedCharts ?? []).map((tag) => {
                              const onClick = chipClickHandler(tag.chartId);
                              return (
                                <ChartChip
                                  key={tag.chartId}
                                  label={onClick ? chartLabelFor(tag.chartId) : tag.label}
                                  dead={!onClick}
                                  onClick={onClick}
                                />
                              );
                            })}
                            {message.intent && (
                              <button
                                type="button"
                                className="qp-ai-intent-badge"
                                disabled={
                                  isLoading ||
                                  decidingIntent ||
                                  !tagIntentUrl ||
                                  (message.taggedCharts?.length ?? 0) !== 1
                                }
                                title="Switch intent and re-run"
                                onClick={() => {
                                  const current = message.intent as TagIntent;
                                  rerunWithIntent(message, nextIntent(current, message.taggedCharts?.length ?? 0));
                                }}
                              >
                                {TAG_INTENT_LABELS[message.intent as TagIntent] ?? message.intent}
                              </button>
                            )}
                          </div>
                        )}
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
                            darkMode={darkMode}
                            datasourceCount={selectedDatasourceIds.length}
                            mapGeo={mapGeo}
                            hidePlan={isNarrowLayout && message.id === pinnedPlanId}
                            onAddViz={(block) => handleAddVizBlock(block, message)}
                            onAddReport={(turn) => handleAddReportToEditor(turn)}
                            selection={
                              reportMode
                                ? {
                                    isSelected: (id) => vizSelected[id] ?? true,
                                    isAdded: (id) => Boolean(vizAdded[id]),
                                    onToggle: (id) =>
                                      setVizSelected((prev) => ({ ...prev, [id]: !(prev[id] ?? true) })),
                                    onAddSelected: (ids) => handleAddReportToEditor(message, ids),
                                    getTitle: (block) =>
                                      buildChartBlockInput({
                                        chartSpec: block.jsonRenderSpec ?? block.chartSpec,
                                      })?.props.title || undefined,
                                  }
                                : undefined
                            }
                            renderVizBlock={(block, preview) => {
                              const target =
                                taggingEnabled && onApplyChartChange
                                  ? findChangeTarget(messages, message.id)
                                  : null;
                              if (!target) return null;
                              const snapshot = getChartSnapshot?.(target.chartId);
                              const payload: ChartPayload = {
                                chartSpec: block.jsonRenderSpec ?? block.chartSpec,
                                rationale: block.rationale ?? getMessageRationale(message),
                                sql: block.sql ?? message.sql,
                                sqlParams: block.sqlParams ?? message.sqlParams ?? null,
                                datasourceIds: snapshot?.datasourceId
                                  ? [snapshot.datasourceId]
                                  : block.datasourceId
                                    ? [block.datasourceId]
                                    : selectedDatasourceIds,
                                tenantFieldName: scopedTenantField,
                                previewTenantId: scopedPreviewTenant,
                                resultId: block.resultId ?? block.queryResult?.resultId ?? message.resultId,
                                question: findPrecedingUserQuestion(messages, message),
                              };
                              const after = {
                                title: buildChartBlockInput(payload)?.props.title ?? "",
                                presentationKind: block.presentationKind ?? null,
                                sql: block.sql ?? "",
                              };
                              const beforeBlock = snapshot
                                ? {
                                    id: `before-${snapshot.chartId}`,
                                    type: "viz" as const,
                                    chartSpec: snapshot.chartSpec,
                                    jsonRenderSpec: snapshot.jsonRenderSpec,
                                    presentationKind: snapshot.presentationKind ?? undefined,
                                    sql: snapshot.sql,
                                    sqlParams: snapshot.params,
                                    datasourceId: snapshot.datasourceId,
                                  }
                                : null;
                              const state = changeStates[block.id] ?? "pending";
                              return (
                                <ChartChangeCard
                                  mode={target.mode}
                                  summary={
                                    snapshot
                                      ? summarizeChartChange(
                                          { title: snapshot.title, presentationKind: snapshot.presentationKind, sql: snapshot.sql },
                                          after,
                                        )
                                      : "The tagged chart was removed"
                                  }
                                  after={preview}
                                  before={beforeBlock}
                                  loadBeforeRows={runSqlForRestoredChart}
                                  state={state}
                                  targetRemoved={!snapshot && state === "pending"}
                                  darkMode={darkMode}
                                  onApply={() => {
                                    const ok = onApplyChartChange?.({ chartId: target.chartId, mode: target.mode, payload });
                                    if (ok) {
                                      setSendError(null);
                                      setChangeStates((prev) => ({ ...prev, [block.id]: "applied" }));
                                    } else {
                                      setSendError("The chart could not be updated because it is no longer on the Dashboard.");
                                    }
                                  }}
                                  onDiscard={() => setChangeStates((prev) => ({ ...prev, [block.id]: "discarded" }))}
                                />
                              );
                            }}
                            resolveChartRef={
                              taggingEnabled
                                ? (ref) => {
                                    const resolved = resolveChartRef(ref, message.chartRefs, charts ?? []);
                                    return {
                                      label: resolved.label,
                                      removed: resolved.removed,
                                      onClick: resolved.removed
                                        ? undefined
                                        : chipClickHandler(resolved.chartId ?? ""),
                                    };
                                  }
                                : undefined
                            }
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
                                  darkMode={darkMode}
                                  datasourceCount={selectedDatasourceIds.length}
                                  mapGeo={mapGeo}
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
                          <ChatMarkdown content={message.content} />
                        )}

                      </div>
                    </div>
                  );
                })}

              </div>

              {selectionTurn && !isNarrowLayout && (
                <div className="qp-ai-selection-bar">
                  <button
                    type="button"
                    disabled={isLoading || selectionPendingIds.length === 0}
                    onClick={() => handleAddReportToEditor(selectionTurn, selectionPendingIds)}
                    className="qp-ai-modal-add-chart-btn"
                  >
                    Add {selectionPendingIds.length} selected
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleAddReportToEditor(selectionTurn)}
                    className="qp-ai-modal-add-report-btn"
                  >
                    Add report
                  </button>
                </div>
              )}

              <div className={`qp-ai-modal-footer${isNarrowLayout ? " qp-ai-modal-footer-deck" : ""}`}>
                {mention && (
                  <ChartTagPicker
                    options={pickerOptions.map(({ chart, label }) => ({ chartId: chart.chartId, label }))}
                    activeIndex={Math.min(pickerIndex, Math.max(pickerOptions.length - 1, 0))}
                    onSelect={(option) => selectTag(option.chartId)}
                  />
                )}
                {pendingIntent && (
                  <div className="qp-ai-intent-ask" role="group" aria-label="What should I do with the tagged chart?">
                    <span>What should I do with the tagged chart?</span>
                    {pendingIntent.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="qp-ai-intent-badge"
                        onClick={() =>
                          void handleSendMessage(pendingIntent.text, {
                            taggedChartIds: pendingIntent.tagIds,
                            intent: option,
                          })
                        }
                      >
                        {TAG_INTENT_LABELS[option]}
                      </button>
                    ))}
                  </div>
                )}
                {decidingIntent && <div className="qp-ai-thread-intent">Deciding what to do…</div>}
                {sendError && (
                  <div className="qp-ai-thread-error" role="alert">
                    {sendError}
                  </div>
                )}
                {taggedChartIds.length > 0 && (
                  <div className="qp-ai-tag-row">
                    {taggedChartIds.map((chartId) => (
                      <ChartChip
                        key={chartId}
                        label={chartLabelFor(chartId)}
                        dead={!chipClickHandler(chartId)}
                        onClick={chipClickHandler(chartId)}
                        onRemove={() => {
                          setSendError(null);
                          setTaggedChartIds((prev) => prev.filter((id) => id !== chartId));
                        }}
                      />
                    ))}
                  </div>
                )}
                {isNarrowLayout ? (
                  <div className="qp-ai-deck" data-busy={isLoading ? "true" : "false"}>
                    {selectionTurn && (
                      <SelectionTray
                        blocks={(selectionTurn.blocks ?? []).filter(
                          (block): block is ReportVizBlock => block.type === "viz",
                        )}
                        isSelected={(id) => vizSelected[id] ?? true}
                        isAdded={(id) => Boolean(vizAdded[id])}
                        pendingCount={selectionPendingIds.length}
                        disabled={isLoading}
                        onAddSelected={() => handleAddReportToEditor(selectionTurn, selectionPendingIds)}
                        onAddReport={() => handleAddReportToEditor(selectionTurn)}
                      />
                    )}
                    {pinnedPlanSteps.length > 0 && (
                      <PlanTrack
                        steps={pinnedPlanSteps}
                        running={pinnedPlanRunning}
                        open={planOpen}
                        onToggle={() => setPlanOpen((open) => !open)}
                        panelId={planPanelId}
                      />
                    )}
                    <div className="qp-ai-composer">
                    <div className="qp-ai-composer-box">
                      <input
                        ref={promptInputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                          setInputValue(e.target.value);
                          setPickerIndex(0);
                          setPendingIntent(null);
                        }}
                        onKeyDown={handlePromptKeyDown}
                        placeholder="Ask anything, or describe a chart"
                        className="qp-ai-composer-input"
                        aria-label="Chart prompt"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendMessage()}
                        disabled={!inputValue.trim() || isLoading}
                        className="qp-ai-composer-send"
                        data-busy={isLoading ? "true" : "false"}
                        aria-label={isLoading ? "Assistant is working" : "Send message"}
                      >
                        {isLoading ? (
                          <LoaderCircleIcon className="qp-ai-modal-spin" aria-hidden />
                        ) : (
                          <ArrowUpIcon aria-hidden />
                        )}
                      </button>
                    </div>
                    <div className="qp-ai-composer-toolbar" ref={toolbarRef}>
                      {threadsClient && (
                        <button
                          ref={historyTriggerRef}
                          type="button"
                          className="qp-ai-composer-chip"
                          aria-label="Chat history"
                          title="Chat history"
                          aria-haspopup="dialog"
                          aria-expanded={openPopup === "history"}
                          aria-controls={historyPopupId}
                          onClick={() => setOpenPopup((cur) => (cur === "history" ? null : "history"))}
                        >
                          <HistoryIcon className="w-4 h-4" aria-hidden />
                          {threads.length > 0 && (
                            <span className="qp-ai-composer-count" aria-hidden>
                              {threads.length > 99 ? "99+" : threads.length}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        ref={dataTriggerRef}
                        type="button"
                        className={`qp-ai-composer-chip qp-ai-composer-ds${selectedDatasourceIds.length === 0 ? " qp-ai-composer-chip-attention" : ""}`}
                        aria-label={`Data and preview settings, ${datasourceSummaryShort}`}
                        title={datasourceSummaryShort}
                        aria-haspopup="dialog"
                        aria-expanded={openPopup === "data"}
                        aria-controls={dataPopupId}
                        onClick={() => setOpenPopup((cur) => (cur === "data" ? null : "data"))}
                      >
                        <span className="qp-ai-composer-dot" data-on={selectedDatasourceIds.length > 0 ? "true" : "false"} aria-hidden />
                        <DatabaseIcon className="w-4 h-4" aria-hidden />
                        <span className="qp-ai-composer-ds-name">{datasourceChipLabel}</span>
                      </button>
                      {reportMode && <ModeSegment value={reportPreference} onSelect={selectReportPreference} />}
                      {chartModelOptions.length > 0 && (
                        <label className="qp-ai-composer-chip qp-ai-composer-model" title="Model (server default)">
                          <CpuIcon className="w-4 h-4" aria-hidden />
                          <select
                            className="qp-ai-composer-model-select"
                            value=""
                            disabled
                            aria-label="Model (server default)"
                          >
                            {chartModelOptions.map((opt, i) => (
                              <option key={`${i}-${opt.label}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {threadsClient && openPopup === "history" && (
                        <div id={historyPopupId} className="qp-ai-popup" role="dialog" aria-label="Chat history">
                          <div className="qp-ai-popup-title">Conversations</div>
                          <button
                            type="button"
                            className="qp-ai-popup-item qp-ai-popup-new"
                            disabled={isLoading || threadsLoading || (!activeThread && messages.length === 0)}
                            onClick={() => {
                              startNewConversation();
                              setOpenPopup(null);
                            }}
                          >
                            <PlusIcon className="w-4 h-4" aria-hidden />
                            New conversation
                          </button>
                          <div className="qp-ai-popup-divider" />
                          <div className="qp-ai-popup-list">
                            {threads.length === 0 && <div className="qp-ai-popup-empty">No conversations yet</div>}
                            {threads.map((thread) => (
                              <button
                                key={thread.id}
                                type="button"
                                className="qp-ai-popup-item"
                                aria-current={thread.id === activeThread?.id ? "true" : undefined}
                                disabled={isLoading || threadsLoading}
                                onClick={() => {
                                  setOpenPopup(null);
                                  if (thread.id !== activeThread?.id) void openThread(thread);
                                }}
                              >
                                <span className="qp-ai-popup-item-label">{thread.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Always mounted (only hidden while closed): the selector auto-selects a lone
                          datasource on mount, which must happen even if the popup is never opened. */}
                      <div
                        id={dataPopupId}
                        className="qp-ai-popup qp-ai-popup-data"
                        role="dialog"
                        aria-label="Data and preview settings"
                        hidden={openPopup !== "data"}
                      >
                        <div className="qp-ai-popup-title">Data &amp; preview</div>
                        <div className="qp-ai-popup-body">{settingsPaneInner}</div>
                      </div>
                    </div>
                    </div>
                  </div>
                ) : (
                  <div className="qp-ai-modal-pill-compose">
                    <input
                      ref={promptInputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setPickerIndex(0);
                        setPendingIntent(null);
                      }}
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
                )}
              </div>
            </div>

            {!isNarrowLayout && (
              <aside className="qp-ai-modal-settings-pane" aria-label="Chart settings">
                {settingsPaneInner}
              </aside>
            )}

          </div>
    </div>
    </ThemeProvider>
    </NarrowLayoutContext.Provider>
  );
}
