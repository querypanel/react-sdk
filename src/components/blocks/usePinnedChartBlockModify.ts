"use client";

import { isVizSpec } from "../vizSpecGuard";
import { withMapCountry } from "../mapKind";
import { useCallback, useRef, useState } from "react";
import type { SqlModifications, VizModifications } from "../../types";
import type { VizSpec } from "../VizSpecRenderer";
import {
  callPinnedChartModify,
  chartTypeFromVizSpec,
  patchVizSpecChartType,
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
  queryId: string;
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

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

function buildVizspecProps(
  result: PinnedChartModifyResponse,
  previous: VizspecSnapshot,
  currentSpec: VizSpec | null,
  fallbackRows: Array<Record<string, unknown>>,
  options: PinnedChartApplyOptions
): Partial<VizspecSnapshot> {
  // Date-only / viz-skip paths return rows without a regenerated chart — reuse prior encoding.
  const returnedSpec =
    result.chart?.vizSpec ??
    result.chartSpec ??
    currentSpec;
  if (!returnedSpec || !isVizSpec(returnedSpec)) {
    throw new Error("Modify did not return a VizSpec chart");
  }
  const requestedChartType = options.vizModifications?.chartType;
  const nextSpec = requestedChartType
    ? patchVizSpecChartType(returnedSpec, requestedChartType)
    : returnedSpec;
  const rows = Array.isArray(result.rows) ? result.rows : fallbackRows;
  const specWithData = { ...nextSpec, data: rows };
  return {
    chartSpec: JSON.stringify(specWithData),
    sql: result.sql ?? previous.sql,
    // New SQL without a stored query drops the old id, so the old query never runs for it.
    queryId: result.queryId ?? (result.sql ? "" : previous.queryId),
    sqlParams: JSON.stringify(result.params ?? JSON.parse(previous.sqlParams || "{}")),
    rationale: result.rationale || previous.rationale,
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

  nextSpec = injectRowsIntoJsonRenderSpec(nextSpec, rows, fields, {
    replaceExisting: true,
  });

  return {
    jsonRenderSpec: JSON.stringify(nextSpec),
    sql: result.sql ?? previous.sql,
    // New SQL without a stored query drops the old id, so the old query never runs for it.
    queryId: result.queryId ?? (result.sql ? "" : previous.queryId),
    sqlParams: JSON.stringify(result.params ?? JSON.parse(previous.sqlParams || "{}")),
    rationale: result.rationale || previous.rationale,
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

  const applyPropsUpdate = useCallback(
    (next: Record<string, unknown>) => {
      editor?.updateBlock(block, { props: next });
    },
    [editor, block]
  );

  const onApply = useCallback(
    async (options: PinnedChartApplyOptions): Promise<boolean> => {
      if (!editor?.updateBlock || modifyingRef.current) return false;
      if (!options.sqlModifications && !options.vizModifications) return false;

      const common: CommonProps = {
        sql: String(block.props.sql || ""),
        queryId: String(block.props.queryId || ""),
        sqlParams: String(block.props.sqlParams || "{}"),
        rationale: String(block.props.rationale || ""),
        title: String(block.props.title || ""),
        question: String(block.props.question || ""),
      };
      const vizspecSnapshot: VizspecSnapshot = {
        ...common,
        chartSpec: String(block.props.chartSpec || ""),
      };
      const jsonRenderSnapshot: JsonRenderSnapshot = {
        ...common,
        jsonRenderSpec: String(block.props.jsonRenderSpec || ""),
        resultId: String(block.props.resultId || ""),
      };
      const previous = format === "vizspec" ? vizspecSnapshot : jsonRenderSnapshot;
      setError(null);

      // Chart-type-only changes are applied locally (no API call).
      const localChartType = options.vizModifications?.chartType;
      const isChartTypeOnly =
        Boolean(localChartType) &&
        !options.sqlModifications &&
        !options.vizModifications?.xAxis &&
        !options.vizModifications?.yAxis;

      if (isChartTypeOnly && localChartType) {
        let nextProps: Record<string, unknown> | null = null;
        if (format === "vizspec") {
          if (currentVizSpec) {
            nextProps = {
              chartSpec: JSON.stringify(
                patchVizSpecChartType(currentVizSpec, localChartType)
              ),
            };
          }
        } else {
          const swapped = swapJsonRenderChartType(
            parseJson(jsonRenderSnapshot.jsonRenderSpec),
            localChartType
          );
          if (!swapped) {
            setError("This chart type is not supported for this chart");
            return false;
          }
          nextProps = { jsonRenderSpec: JSON.stringify(swapped) };
        }
        // Skip no-ops so the undo snapshot is not clobbered.
        if (
          !nextProps ||
          Object.entries(nextProps).every(([key, value]) => value === block.props[key])
        ) {
          return false;
        }
        setUndoSnapshot(previous);
        applyPropsUpdate(nextProps);
        return true;
      }

      if (!modifyChartUrl) return false;
      modifyingRef.current = true;
      setIsModifying(true);

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
            // A stored chart or query is the base on the server: send the id, not its SQL.
            ...(typeof block.props.savedChartId === "string" && block.props.savedChartId
              ? { chart_id: block.props.savedChartId }
              : typeof block.props.queryId === "string" && block.props.queryId
                ? { query_id: block.props.queryId }
                : { sql: common.sql, params: sqlParams }),
            question,
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
                vizspecSnapshot,
                currentVizSpec,
                fallbackRows,
                options
              )
            : buildJsonRenderProps(
                result,
                jsonRenderSnapshot,
                currentJsonRenderSpec,
                options
              );

        setUndoSnapshot(previous);
        applyPropsUpdate(nextProps);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to modify chart");
        return false;
      } finally {
        modifyingRef.current = false;
        setIsModifying(false);
      }
    },
    [
      modifyChartUrl,
      editor,
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

  /** Map blocks: sets the spec's country; the map re-resolves and redraws from the new spec. */
  const onMapCountryChange = useCallback(
    (country: string): boolean => {
      if (!editor?.updateBlock) return false;
      const key = format === "vizspec" ? "chartSpec" : "jsonRenderSpec";
      const next = withMapCountry(parseJson(String(block.props[key] || "")), country);
      if (!next) return false;
      applyPropsUpdate({ [key]: JSON.stringify(next) });
      return true;
    },
    [editor, format, block, applyPropsUpdate]
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
    canUndo: Boolean(undoSnapshot),
    onApply,
    onUndo,
    onMapCountryChange,
  };
}
