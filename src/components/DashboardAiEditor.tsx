"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Block } from "@blocknote/core";
import { RocketIcon, Save, SparklesIcon } from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import {
  useCreateBlockNote,
  SuggestionMenuController,
} from "@blocknote/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import type { ThemeColors, EmbedBranding } from "../types";
import { defaultColors } from "../themes";
import { BlockNoteThemedView } from "./BlockNoteThemedView";
import {
  createDashboardSchema,
  dashboardBlockNoteDictionary,
  getDashboardSlashMenuItems,
  multiColumnDropCursor,
} from "./blocknoteDashboard";
import { createChartBlockSpec } from "./blocks/ChartBlock";
import { createJsonRenderChartBlockSpec } from "./blocks/JsonRenderChartBlock";
import { MapGeoProvider, resolveGeoBaseUrl } from "./blocks/mapGeo";
import { AIChartModal, type ChartGenerationEvent } from "./AIChartModal";
import { AssistantPanel } from "./AssistantPanel";
import { Workspace, type WorkspaceHandle } from "./Workspace";
import type { AssistantTransport } from "./ai-chart-modal/mastraChartStream";
import type { DashboardReportInsertBlock } from "./ai-chart-modal/types";
import { markdownToSimpleEditorBlocks } from "./ai-chart-modal/markdownToBlocks";
import { DeploySuccessModal } from "./DeploySuccessModal";
import { ThemeProvider } from "../context/ThemeContext";
import { normalizeBlockNoteContent } from "./blocknoteContent";
import {
  buildChartBlockInput,
  buildChartPropsPatch,
  isChartBlockType,
  listChartBlocks,
  type ChartBlockSummary,
  type ChartPayload,
  type DashboardEditorController,
} from "./dashboardEditorController";
import {
  applyChartChange,
  collectMissingChartIds,
  findChartBlockSnapshot,
  type ChartChangeMode,
  type ChartEditorLike,
} from "./workspaceState";
import { stripEmbeddedDataFromBlocks, type BlockLike } from "./stripEmbeddedDataFromBlocks";
import { chartsClientFor, stripStoredChartQueries } from "./dashboardCharts";
import { useDashboardChartRows } from "./useDashboardChartRows";
import { isDocumentDark } from "../utils/documentTheme";

const EMPTY_HEADERS: Record<string, string> = {};

function getSafeInitialBlocks(initialContent: string, darkMode: boolean) {
  try {
    if (initialContent) {
      const parsed = normalizeBlockNoteContent(JSON.parse(initialContent), darkMode);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to parse initial content:", error);
  }

  return [{ type: "paragraph", content: [] }];
}

const editorStyles = `
  .bn-container {
    min-height: calc(100vh - 16rem);
  }
  .bn-editor {
    min-height: calc(100vh - 16rem);
  }
  .ProseMirror {
    min-height: calc(100vh - 16rem);
    padding: 2rem;
  }
  [data-theme="light"] .bn-container,
  [data-theme="light"] .bn-editor,
  [data-theme="light"] .ProseMirror {
    background-color: hsl(0 0% 100%);
    color: hsl(222.2 84% 4.9%);
  }
  [data-theme="dark"] .bn-container,
  [data-theme="dark"] .bn-editor,
  [data-theme="dark"] .ProseMirror {
    background-color: hsl(222.2 84% 4.9%);
    color: hsl(210 40% 98%);
  }
  [data-theme="dark"] .bn-container {
    border-color: hsl(217.2 32.6% 17.5%);
  }
  [data-theme="dark"] .bn-menu-dropdown,
  [data-theme="dark"] .bn-suggestion-menu {
    background-color: hsl(217.2 32.6% 17.5%);
    border-color: hsl(217.2 32.6% 17.5%);
  }
  [data-theme="dark"] .bn-menu-item:hover {
    background-color: hsl(217.2 32.6% 25%);
  }
  [data-qp-chart-highlight] {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
    border-radius: 0.5rem;
    transition: outline-color 0.3s;
  }
`;

export interface DashboardAiEditorProps {
  /** Initial BlockNote content as JSON string */
  initialContent: string;
  /** Callback when save or deploy is triggered */
  onSave: (content: string, options?: { deploy?: boolean }) => Promise<void>;
  /** Organization ID (required for AI modal) */
  organizationId?: string;
  /** Dashboard ID (required for AI modal) */
  dashboardId?: string;
  /** Dashboard type for tenant preview UI */
  dashboardType?: "customer" | "internal";
  /** Show deploy button (admin flow) */
  showDeployButton?: boolean;
  /** Show save button in editor toolbar. Set false when parent provides Save (e.g. embed toolbar). */
  showSaveButton?: boolean;
  /** Whether editor is editable. Set false for viewer mode. */
  editable?: boolean;
  /**
   * Customer/embed API base URL. When empty, uses admin defaults (/api/...).
   * Each `*Url` override below takes precedence over this base.
   */
  apiBaseUrl?: string;
  /** Override run-sql URL (e.g. /api/dashboards/run-sql for admin) */
  runSqlUrl?: string;
  /** Override the map geo base URL (`/boundaries/:country`, `/resolve`). Default: apiBaseUrl + /geo, else /api/geo. */
  geoBaseUrl?: string;
  /** Override modify-chart URL for pinned chart controls */
  modifyChartUrl?: string;
  /** Override AI chart URL. Pass a Mastra agent stream URL to get the streaming agent UI. */
  generateChartWithSqlUrl?: string;
  /** How `generateChartWithSqlUrl` answers; see `AssistantPanel`. */
  assistantTransport?: AssistantTransport;
  /** Override datasources URL */
  datasourcesUrl?: string;
  /** Override query result URL used by json-render previews */
  queryResultBaseUrl?: string;
  /** Dark mode. When undefined, auto-detects from DOM (html class/data-theme). */
  darkMode?: boolean;
  /** Theme colors */
  themeColors?: ThemeColors;
  /** Font family */
  fontFamily?: string;
  /** Extra headers for AI/datasource requests */
  headers?: Record<string, string>;
  /** CSS class */
  className?: string;
  /** Optional reset key to force reloading initialContent */
  contentResetKey?: string | number;
  /** Optional ref to trigger save from parent (e.g. toolbar Save button) */
  saveRef?: React.MutableRefObject<(() => void | Promise<void>) | null>;
  /** Optional extra content in toolbar (e.g. "Datasources & tenant" button) */
  toolbarExtra?: React.ReactNode;
  /** When set, only these datasource IDs are offered in AI chart modal (e.g. from dashboard.available_datasource_ids). */
  availableDatasourceIds?: string[] | null;
  /** Default tenant field name in AI chart modal (e.g. from dashboard.tenant_field_name). */
  tenantFieldName?: string | null;
  /** Per-datasource tenant field name (e.g. from dashboard.tenant_field_by_datasource). Overrides tenantFieldName for each datasource. */
  tenantFieldByDatasource?: Record<string, string> | null;
  /** When true, AI modal does not show tenant field / preview tenant ID (e.g. customer embed; tenant from JWT only). */
  hideTenantInputsInAiModal?: boolean;
  /** Whitelabel strings for embed (e.g. AI modal title). Passed from QuerypanelEmbedded branding. */
  embedBranding?: EmbedBranding;
  /** Host analytics hook for chart asks. */
  onChartGeneration?: (event: ChartGenerationEvent) => void;
  /** Optional ref filled with an imperative controller for Chart blocks (list/insert/update/replace/focus). */
  controllerRef?: React.MutableRefObject<DashboardEditorController | null>;
  /** Fires with the Chart blocks on mount and whenever the set or content of Chart blocks changes. */
  onChartsChange?: (charts: ChartBlockSummary[]) => void;
  /**
   * Where the Assistant lives. "modal" (default, customer embed) opens it in a dialog from the "/"
   * menu. "workspace" shows the Dashboard on the left and the Assistant on the right (admin).
   */
  assistantLayout?: "modal" | "workspace";
  /** Assistant Threads endpoint for workspace mode (e.g. /api/assistant-threads). Omit for no persistence. */
  assistantThreadsUrl?: string;
  /** Tag-intent endpoint for workspace mode (e.g. /api/ai/tag-intent). Omit to skip intent decisions. */
  assistantTagIntentUrl?: string;
}

export function DashboardAiEditor({
  initialContent,
  onSave,
  organizationId,
  dashboardId,
  dashboardType = "customer",
  showDeployButton = true,
  showSaveButton = true,
  editable = true,
  apiBaseUrl = "",
  runSqlUrl,
  geoBaseUrl,
  modifyChartUrl,
  generateChartWithSqlUrl,
  assistantTransport,
  datasourcesUrl,
  queryResultBaseUrl,
  darkMode,
  themeColors = defaultColors,
  fontFamily,
  headers = EMPTY_HEADERS,
  className = "",
  contentResetKey,
  saveRef,
  toolbarExtra,
  availableDatasourceIds,
  tenantFieldName: tenantFieldNameProp,
  tenantFieldByDatasource,
  hideTenantInputsInAiModal = false,
  embedBranding,
  onChartGeneration,
  controllerRef,
  onChartsChange,
  assistantLayout = "modal",
  assistantThreadsUrl,
  assistantTagIntentUrl,
}: DashboardAiEditorProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [showDeploySuccess, setShowDeploySuccess] = useState(false);
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const isWorkspace = assistantLayout === "workspace";

  // Detect dark mode from DOM to avoid flushSync when parent re-renders on theme change.
  // When darkMode prop is provided, use it as override; otherwise auto-detect from DOM.
  const [detectedDarkMode, setDetectedDarkMode] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    // Sync initial value
    setDetectedDarkMode(isDocumentDark());

    const observer = new MutationObserver(() => {
      const isDark = isDocumentDark();
      // Use queueMicrotask so the state update runs outside React's current render
      queueMicrotask(() => setDetectedDarkMode(isDark));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    return () => observer.disconnect();
  }, []);

  // Use prop when explicitly provided; otherwise use DOM detection
  const effectiveDarkMode = darkMode !== undefined ? darkMode : detectedDarkMode;

  // An explicit override always wins (admin passes the Mastra stream URL); otherwise derive
  // from the embed API base, falling back to admin's same-origin routes.
  const resolveUrl = (override: string | undefined, embedPath: string, adminPath: string) =>
    override ?? (apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, "")}${embedPath}` : adminPath);

  const resolvedRunSqlUrl = resolveUrl(runSqlUrl, "/query/run-sql", "/api/dashboards/run-sql");
  // Embedded editors store tenant charts; the admin editor stores org charts.
  const chartsClient = useMemo(
    () => chartsClientFor({ apiBaseUrl, dashboardId, headers, organizationId }),
    [apiBaseUrl, dashboardId, headers, organizationId]
  );
  const resolvedGeoBaseUrl = resolveGeoBaseUrl(geoBaseUrl, apiBaseUrl);
  const resolvedModifyChartUrl = resolveUrl(
    modifyChartUrl,
    "/query/modify-chart",
    "/api/dashboards/modify-chart"
  );
  const resolvedGenerateChartWithSqlUrl = resolveUrl(
    generateChartWithSqlUrl,
    "/ai/generate-chart-with-sql",
    "/api/ai/generate-chart-with-sql"
  );
  const resolvedDatasourcesUrl = resolveUrl(datasourcesUrl, "/datasources", "/api/datasources");
  const resolvedQueryResultBaseUrl = resolveUrl(
    queryResultBaseUrl,
    "/query-results",
    "/api/query-results"
  );

  // Bridge to askAboutChart (defined below) so the block specs stay stable across renders.
  const askAboutChartRef = useRef<((chartId: string) => void) | null>(null);
  const onAskAboutThis = useMemo(
    () =>
      isWorkspace && editable
        ? (chartId: string) => askAboutChartRef.current?.(chartId)
        : undefined,
    [isWorkspace, editable]
  );

  const chartBlockSpec = useMemo(
    () =>
      createChartBlockSpec({
        apiBaseUrl: apiBaseUrl || "",
        colors: themeColors,
        runSqlUrl: resolvedRunSqlUrl,
        modifyChartUrl: resolvedModifyChartUrl,
        onAskAboutThis,
        organizationId,
        dashboardId,
        headers,
      }),
    [
      apiBaseUrl,
      themeColors,
      resolvedRunSqlUrl,
      resolvedModifyChartUrl,
      onAskAboutThis,
      organizationId,
      dashboardId,
      headers,
    ]
  );

  const jsonRenderBlockSpec = useMemo(
    () =>
      createJsonRenderChartBlockSpec({
        apiBaseUrl: apiBaseUrl || "",
        colors: themeColors,
        queryResultBaseUrl: resolvedQueryResultBaseUrl,
        runSqlUrl: resolvedRunSqlUrl,
        modifyChartUrl: resolvedModifyChartUrl,
        onAskAboutThis,
        organizationId,
        dashboardId,
        headers,
      }),
    [
      apiBaseUrl,
      themeColors,
      resolvedQueryResultBaseUrl,
      resolvedRunSqlUrl,
      resolvedModifyChartUrl,
      onAskAboutThis,
      organizationId,
      dashboardId,
      headers,
    ]
  );

  const schema = useMemo(
    () =>
      createDashboardSchema({
        chart: chartBlockSpec(),
        "json-render-chart": jsonRenderBlockSpec(),
      }),
    [chartBlockSpec, jsonRenderBlockSpec]
  );

  const contentSignature = `${String(contentResetKey ?? "")}::${initialContent}::${effectiveDarkMode ? "dark" : "light"}`;
  const parsedInitialContent = useMemo(
    () => getSafeInitialBlocks(initialContent, effectiveDarkMode) as Block[],
    [initialContent, effectiveDarkMode]
  );

  const editor = useCreateBlockNote({
    schema,
    initialContent: parsedInitialContent,
    dropCursor: multiColumnDropCursor,
    dictionary: dashboardBlockNoteDictionary,
  }, [schema, contentSignature]);

  // Chart blocks and their rows stay in step from here: on load, on any query change, on Save.
  const chartRows = useDashboardChartRows(editor as never, chartsClient);

  const insertAIChartItem = useCallback(
    (): DefaultReactSuggestionItem => ({
      title: "AI Chart Assistant",
      onItemClick: () =>
        isWorkspace ? workspaceRef.current?.openAssistant() : setIsAIModalOpen(true),
      aliases: ["ai", "chart", "assistant", "generate", "visualization", "graph"],
      group: "AI Tools",
      icon: <SparklesIcon size={18} />,
      subtext: "Generate charts with AI assistance",
      badge: "AI",
    }),
    [isWorkspace]
  );

  const getCustomSlashMenuItems = useCallback(
    (): DefaultReactSuggestionItem[] =>
      getDashboardSlashMenuItems(editor, [insertAIChartItem()]),
    [editor, insertAIChartItem]
  );

  const handleAddChart = useCallback(
    (payload: ChartPayload) => {
      const input = buildChartBlockInput(payload);
      if (!input) return;
      editor.insertBlocks(
        [input as never],
        editor.getTextCursorPosition().block,
        "after"
      );
      setIsAIModalOpen(false);
    },
    [editor]
  );

  const handleAddReport = useCallback(
    (blocks: DashboardReportInsertBlock[]) => {
      if (blocks.length === 0) return;

      const insertables: Array<Record<string, unknown>> = [];

      for (const block of blocks) {
        if (block.type === "text") {
          for (const simple of markdownToSimpleEditorBlocks(block.markdown)) {
            if (simple.type === "heading") {
              insertables.push({
                type: "heading",
                props: { level: simple.level },
                content: simple.text,
              });
            } else {
              insertables.push({
                type: "paragraph",
                content: simple.text,
              });
            }
          }
          continue;
        }

        const input = buildChartBlockInput(block);
        if (input) insertables.push(input);
      }

      if (insertables.length === 0) return;

      editor.insertBlocks(
        insertables as never[],
        editor.getTextCursorPosition().block,
        "after"
      );
      setIsAIModalOpen(false);
    },
    [editor]
  );

  useEffect(() => {
    if (!controllerRef) return;
    const controller: DashboardEditorController = {
      listCharts: () => listChartBlocks(editor.document),
      insertChart: (payload, options) => {
        const input = buildChartBlockInput(payload);
        if (!input) return undefined;
        const reference =
          (options?.referenceBlockId && editor.getBlock(options.referenceBlockId)) ||
          editor.getTextCursorPosition().block;
        const [inserted] = editor.insertBlocks(
          [input as never],
          reference,
          options?.placement ?? "after"
        );
        return inserted?.id;
      },
      updateChart: (blockId, patch) => {
        const block = editor.getBlock(blockId);
        if (!block || !isChartBlockType(block.type)) return false;
        const props = buildChartPropsPatch(block.type, patch);
        if (!props) return false;
        // updateBlock is one transaction; transact guards it staying one if that changes.
        editor.transact(() => {
          editor.updateBlock(blockId, { props } as never);
        });
        return true;
      },
      replaceChart: (blockId, payload) => {
        const block = editor.getBlock(blockId);
        if (!block || !isChartBlockType(block.type)) return false;
        const input = buildChartBlockInput(payload);
        if (!input) return false;
        editor.transact(() => {
          editor.updateBlock(blockId, input as never);
        });
        return true;
      },
      focusChart: (blockId) => {
        const block = editor.getBlock(blockId);
        if (!block || !isChartBlockType(block.type)) return false;
        editor.setTextCursorPosition(blockId);
        const el =
          typeof document !== "undefined" && typeof CSS !== "undefined"
            ? document.querySelector(`[data-id="${CSS.escape(blockId)}"]`)
            : null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      },
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef, editor]);

  const onChartsChangeRef = useRef(onChartsChange);
  onChartsChangeRef.current = onChartsChange;
  useEffect(() => {
    if (!mounted || !onChartsChangeRef.current) return;
    let lastSignature = "";
    const emit = () => {
      const charts = listChartBlocks(editor.document);
      const signature = JSON.stringify(charts);
      if (signature === lastSignature) return;
      lastSignature = signature;
      onChartsChangeRef.current?.(charts);
    };
    emit();
    return editor.onChange(emit);
  }, [editor, mounted]);

  // Chart ids are assigned lazily (no migration) and persisted by the next save.
  useEffect(() => {
    if (!mounted || !editable) return;
    const assign = () => {
      const missing = collectMissingChartIds(editor.document);
      if (missing.length === 0) return;
      editor.transact(() => {
        for (const { blockId, chartId } of missing) {
          editor.updateBlock(blockId, { props: { chartId } } as never);
        }
      });
    };
    assign();
    return editor.onChange(assign);
  }, [editor, mounted, editable]);

  const [tagRequest, setTagRequest] = useState<{ chartId: string; nonce: number } | undefined>();
  const askAboutChart = useCallback((chartId: string) => {
    setTagRequest((prev) => ({ chartId, nonce: (prev?.nonce ?? 0) + 1 }));
    workspaceRef.current?.openAssistant();
  }, []);
  askAboutChartRef.current = askAboutChart;

  const [taggableCharts, setTaggableCharts] = useState<ChartBlockSummary[]>([]);
  useEffect(() => {
    if (!mounted || !isWorkspace) return;
    let lastSignature = "";
    const emit = () => {
      const charts = listChartBlocks(editor.document).filter((chart) => chart.chartId);
      const signature = JSON.stringify(charts);
      if (signature === lastSignature) return;
      lastSignature = signature;
      setTaggableCharts(charts);
    };
    emit();
    return editor.onChange(emit);
  }, [editor, mounted, isWorkspace]);

  const getChartSnapshot = useCallback(
    (chartId: string) =>
      findChartBlockSnapshot(editor.document, chartId, listChartBlocks(editor.document)),
    [editor]
  );

  const applyChartChangeToEditor = useCallback(
    (change: { chartId: string; mode: ChartChangeMode; payload: ChartPayload }) => {
      const snapshot = getChartSnapshot(change.chartId);
      if (!snapshot) return false;
      return applyChartChange(editor as unknown as ChartEditorLike, {
        blockId: snapshot.blockId,
        mode: change.mode,
        payload: change.payload,
      }).ok;
    },
    [editor, getChartSnapshot]
  );

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChipClick = useCallback(
    (blockId: string) => {
      if (!isChartBlockType(editor.getBlock(blockId)?.type ?? "")) return;
      editor.setTextCursorPosition(blockId);
      const el = document.querySelector(`[data-id="${CSS.escape(blockId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-qp-chart-highlight", "");
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => el.removeAttribute("data-qp-chart-highlight"), 1800);
    },
    [editor]
  );

  // Saved content keeps chart rows by reference only (see stripStoredChartQueries).
  const stripDataFromChartBlocks = useCallback(() => {
    return stripStoredChartQueries(stripEmbeddedDataFromBlocks(editor.document as unknown as BlockLike[]));
  }, [editor]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      await chartRows.flush();
      const cleanedDocument = stripDataFromChartBlocks();
      const content = JSON.stringify(cleanedDocument);
      await onSave(content, { deploy: true });
      setShowDeploySuccess(true);
      setTimeout(() => setShowDeploySuccess(false), 3000);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await chartRows.flush();
      const cleanedDocument = stripDataFromChartBlocks();
      const content = JSON.stringify(cleanedDocument);
      await onSave(content);
    } finally {
      setIsSaving(false);
    }
  }, [chartRows, stripDataFromChartBlocks, onSave]);

  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave;
      return () => {
        saveRef.current = null;
      };
    }
  }, [saveRef, handleSave]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-center py-16 ${className}`}
        style={{ minHeight: 200 }}
      >
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: themeColors.primary }}
        />
      </div>
    );
  }

  const dashboardNode = (
    <ThemeProvider darkMode={effectiveDarkMode}>
      <div
        className="border rounded-lg overflow-hidden"
        data-theme={effectiveDarkMode ? "dark" : "light"}
        style={{ borderColor: themeColors.border }}
      >
        <BlockNoteThemedView
          editor={editor}
          editable={editable}
          darkMode={effectiveDarkMode}
          themeColors={themeColors}
          fontFamily={fontFamily}
          style={{ minHeight: "calc(100vh - 16rem)" }}
          slashMenu={false}
        >
          {editable && (
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(getCustomSlashMenuItems(), query)
              }
            />
          )}
        </BlockNoteThemedView>
      </div>
    </ThemeProvider>
  );

  return (
    <MapGeoProvider geoBaseUrl={resolvedGeoBaseUrl}>
      <style>{editorStyles}</style>
      <div className={`space-y-4 ${className}`}>
        {editable && (showDeployButton || showSaveButton || toolbarExtra) && (
          <div className="flex justify-end gap-2 flex-wrap">
            {toolbarExtra}
            {!showDeployButton && showSaveButton && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-semibold rounded-lg border transition-opacity disabled:opacity-60"
                style={{
                  backgroundColor: themeColors.primary,
                  color: "#fff",
                  borderColor: themeColors.primary,
                }}
              >
                <Save className="w-4 h-4 inline-block mr-2 align-middle" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            )}
            {showDeployButton && (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={isDeploying}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-opacity disabled:opacity-60"
                style={{
                  background: "linear-gradient(to right, #9333ea, #4f46e5, #9333ea)",
                  color: "#fff",
                }}
              >
                <RocketIcon className="w-4 h-4 inline-block mr-2 align-middle" />
                {isDeploying ? "Deploying..." : "Deploy to Customers"}
              </button>
            )}
          </div>
        )}

        {isWorkspace && editable && organizationId && dashboardId ? (
          <Workspace
            ref={workspaceRef}
            darkMode={effectiveDarkMode}
            assistantTitle={embedBranding?.aiChartModalTitle ?? "AI Assistant"}
            dashboard={dashboardNode}
            renderAssistant={({ focusRequest }) => (
              <AssistantPanel
                onAddChart={handleAddChart}
                onAddReport={handleAddReport}
                reportMode={isWorkspace}
                organizationId={organizationId}
                dashboardId={dashboardId}
                dashboardType={dashboardType}
                generateChartWithSqlUrl={resolvedGenerateChartWithSqlUrl}
                assistantTransport={assistantTransport}
                datasourcesUrl={resolvedDatasourcesUrl}
                queryResultBaseUrl={resolvedQueryResultBaseUrl}
                headers={headers}
                darkMode={effectiveDarkMode}
                availableDatasourceIds={availableDatasourceIds}
                defaultTenantFieldName={tenantFieldNameProp}
                tenantFieldByDatasource={tenantFieldByDatasource}
                hideTenantInputs={hideTenantInputsInAiModal}
                createTitle={embedBranding?.aiChartModalCreateTitle}
                onChartGeneration={onChartGeneration}
                autoFocus={false}
                focusRequest={focusRequest}
                charts={taggableCharts}
                getChartSnapshot={getChartSnapshot}
                onApplyChartChange={applyChartChangeToEditor}
                onChartChipClick={handleChipClick}
                tagRequest={tagRequest}
                threadsUrl={assistantThreadsUrl}
                tagIntentUrl={assistantTagIntentUrl}
                runSqlUrl={resolvedRunSqlUrl}
              />
            )}
          />
        ) : (
          dashboardNode
        )}
      </div>

      {editable && !isWorkspace && organizationId && dashboardId && (
        <AIChartModal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          onAddChart={handleAddChart}
          onAddReport={handleAddReport}
          organizationId={organizationId}
          dashboardId={dashboardId}
          dashboardType={dashboardType}
          generateChartWithSqlUrl={resolvedGenerateChartWithSqlUrl}
          assistantTransport={assistantTransport}
          datasourcesUrl={resolvedDatasourcesUrl}
          queryResultBaseUrl={resolvedQueryResultBaseUrl}
          headers={headers}
          darkMode={effectiveDarkMode}
          availableDatasourceIds={availableDatasourceIds}
          defaultTenantFieldName={tenantFieldNameProp}
          tenantFieldByDatasource={tenantFieldByDatasource}
          hideTenantInputs={hideTenantInputsInAiModal}
          title={embedBranding?.aiChartModalTitle}
          createTitle={embedBranding?.aiChartModalCreateTitle}
          onChartGeneration={onChartGeneration}
        />
      )}

      <DeploySuccessModal
        open={showDeploySuccess}
        onOpenChange={setShowDeploySuccess}
        darkMode={effectiveDarkMode}
      />
    </MapGeoProvider>
  );
}
