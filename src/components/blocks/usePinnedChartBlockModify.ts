"use client";

import { useCallback, useRef, useState } from "react";
import type { SqlModifications, VizModifications } from "../../types";
import type { VizSpec } from "../VizSpecRenderer";
import {
  callPinnedChartModify,
  chartTypeFromVizSpec,
  swapJsonRenderChartType,
  type PinnedChartModifyResponse,
} from "./pinnedChartModify";
import type { BlockNoteEditorLike } from "./blockNoteEditor";
import { injectRowsIntoJsonRenderSpec } from "../generative-ui/specData";

export type PinnedChartFormat = "vizspec" | "json-render";

export type PinnedChartApplyOptions = {
  sqlModifications?: SqlModifications;
  vizModifications?: VizModifications;
};

type CommonProps = {
  sql: string;
  sqlParams: string;
  rationale: string;
  title: string;
  question: string;
};

type VizspecSnapshot = CommonProps & { chartSpec: string };
type JsonRenderSnapshot = CommonProps & {
  jsonRenderSpec: string;
  resultId: string;
};

function isVizSpec(value: unknown): value is VizSpec {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "chart" || kind === "table" || kind === "metric";
}

function buildVizspecProps(
  result: PinnedChartModifyResponse,
  previous: VizspecSnapshot,
  fallbackSpec: VizSpec | null,
  fallbackRows: Array<Record<string, unknown>>
): Partial<VizspecSnapshot> {
  const nextSpec =
    result.chart?.vizSpec ?? result.chartSpec ?? (fallbackSpec ? { ...fallbackSpec } : null);
  if (!nextSpec || !isVizSpec(nextSpec)) {
    throw new Error("Modify did not return a VizSpec chart");
  }
  const rows = Array.isArray(result.rows) ? result.rows : fallbackRows;
  const specWithData = { ...nextSpec, data: rows };
  return {
    chartSpec: JSON.stringify(specWithData),
    sql: typeof result.sql === "string" ? result.sql : previous.sql,
    sqlParams: JSON.stringify(result.params ?? JSON.parse(previous.sqlParams || "{}")),
    rationale:
      typeof result.rationale === "string" && result.rationale
        ? result.rationale
        : previous.rationale,
    title:
      (nextSpec as { description?: string; title?: string }).description ||
      (nextSpec as { title?: string }).title ||
      previous.title,
  };
}

function buildJsonRenderProps(
  result: PinnedChartModifyResponse,
  previous: JsonRenderSnapshot,
  currentSpec: unknown,
  options: PinnedChartApplyOptions
): Partial<JsonRenderSnapshot> {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const fields = Array.isArray(result.fields) ? result.fields : [];
  let nextSpec: unknown = currentSpec;

  const chartType =
    options.vizModifications?.chartType ||
    chartTypeFromVizSpec(result.chart?.vizSpec ?? result.chartSpec);
  if (chartType) {
    const swapped = swapJsonRenderChartType(nextSpec, chartType);
    if (swapped) nextSpec = swapped;
  }

  nextSpec = injectRowsIntoJsonRenderSpec(nextSpec, rows, fields);

  return {
    jsonRenderSpec: JSON.stringify(nextSpec),
    sql: typeof result.sql === "string" ? result.sql : previous.sql,
    sqlParams: JSON.stringify(result.params ?? JSON.parse(previous.sqlParams || "{}")),
    rationale:
      typeof result.rationale === "string" && result.rationale
        ? result.rationale
        : previous.rationale,
    resultId: "",
  };
}

export function usePinnedChartBlockModify(input: {
  format: PinnedChartFormat;
  block: { props: Record<string, unknown> };
  editor: BlockNoteEditorLike | undefined;
  modifyChartUrl?: string;
  enableChartControls?: boolean;
  organizationId?: string;
  dashboardId?: string;
  headers: Record<string, string>;
  datasourceIds: string[];
  sqlParams: Record<string, unknown>;
  /** Current vizspec (parsed) for vizspec format */
  currentVizSpec?: VizSpec | null;
  /** Current json-render spec for json-render format */
  currentJsonRenderSpec?: unknown;
  /** Fallback rows when modify response omits them (vizspec) */
  fallbackRows?: Array<Record<string, unknown>>;
}) {
  const {
    format,
    block,
    editor,
    modifyChartUrl,
    enableChartControls = true,
    organizationId,
    dashboardId,
    headers,
    datasourceIds,
    sqlParams,
    currentVizSpec = null,
    currentJsonRenderSpec = null,
    fallbackRows = [],
  } = input;

  const [isModifying, setIsModifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<
    VizspecSnapshot | JsonRenderSnapshot | null
  >(null);
  const modifyingRef = useRef(false);

  const controlsEnabled =
    Boolean(enableChartControls && modifyChartUrl) &&
    Boolean(editor?.isEditable !== false) &&
    Boolean(editor?.updateBlock) &&
    Boolean(typeof block.props.sql === "string" && block.props.sql) &&
    datasourceIds.length > 0;

  const snapshotCommon = useCallback((): CommonProps => {
    return {
      sql: String(block.props.sql || ""),
      sqlParams: String(block.props.sqlParams || "{}"),
      rationale: String(block.props.rationale || ""),
      title: String(block.props.title || ""),
      question: String(block.props.question || ""),
    };
  }, [block.props]);

  const applyPropsUpdate = useCallback(
    (next: Record<string, unknown>) => {
      editor?.updateBlock(block, { props: next });
    },
    [editor, block]
  );

  const onApply = useCallback(
    async (options: PinnedChartApplyOptions) => {
      if (!modifyChartUrl || !editor?.updateBlock || modifyingRef.current) return;
      if (!options.sqlModifications && !options.vizModifications) return;

      modifyingRef.current = true;
      setIsModifying(true);
      setError(null);

      const common = snapshotCommon();
      const previous: VizspecSnapshot | JsonRenderSnapshot =
        format === "vizspec"
          ? { ...common, chartSpec: String(block.props.chartSpec || "") }
          : {
              ...common,
              jsonRenderSpec: String(block.props.jsonRenderSpec || ""),
              resultId: String(block.props.resultId || ""),
            };

      try {
        const question =
          common.question.trim() || common.title.trim() || "Chart";
        const tenantFieldName =
          typeof block.props.tenantFieldName === "string"
            ? block.props.tenantFieldName.trim() || undefined
            : undefined;
        const previewTenantId =
          (typeof block.props.previewTenantId === "string" &&
            block.props.previewTenantId.trim()) ||
          (typeof block.props.tenantId === "string" && block.props.tenantId.trim()) ||
          undefined;

        const result = await callPinnedChartModify(
          modifyChartUrl,
          {
            sql: common.sql,
            question,
            params: sqlParams,
            datasourceIds,
            ...(dashboardId ? { dashboardId } : {}),
            ...(tenantFieldName ? { tenantFieldName } : {}),
            ...(previewTenantId ? { previewTenantId } : {}),
            sqlModifications: options.sqlModifications,
            vizModifications: options.vizModifications,
          },
          headers,
          organizationId
        );

        const nextProps =
          format === "vizspec"
            ? buildVizspecProps(
                result,
                previous as VizspecSnapshot,
                currentVizSpec,
                fallbackRows
              )
            : buildJsonRenderProps(
                result,
                previous as JsonRenderSnapshot,
                currentJsonRenderSpec,
                options
              );

        setUndoSnapshot(previous);
        applyPropsUpdate(nextProps);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to modify chart");
      } finally {
        modifyingRef.current = false;
        setIsModifying(false);
      }
    },
    [
      modifyChartUrl,
      editor,
      snapshotCommon,
      format,
      block.props,
      sqlParams,
      datasourceIds,
      dashboardId,
      headers,
      organizationId,
      currentVizSpec,
      currentJsonRenderSpec,
      fallbackRows,
      applyPropsUpdate,
    ]
  );

  const onUndo = useCallback(() => {
    if (!undoSnapshot || !editor?.updateBlock) return;
    applyPropsUpdate(undoSnapshot);
    setUndoSnapshot(null);
  }, [undoSnapshot, editor, applyPropsUpdate]);

  return {
    controlsEnabled,
    isModifying,
    error,
    setError,
    canUndo: Boolean(undoSnapshot),
    onApply,
    onUndo,
  };
}
