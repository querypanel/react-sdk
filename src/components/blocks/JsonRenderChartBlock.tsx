/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartType, ThemeColors } from "../../types";
import { useThemeContext } from "../../context/ThemeContext";
import { getColorsForMode } from "../../themes";
import { PersistedSpecRenderer } from "../generative-ui/PersistedSpecRenderer";
import {
  getRootElement,
  hasInlineJsonRenderData,
  hydrateSpecRows,
  injectRowsIntoJsonRenderSpec,
  withJsonRenderResultId,
} from "../generative-ui/specData";
import { DEFAULT_CHART_HEIGHT, parseBlockHeight, resolveChartBlockHeight } from "./chartBlockHeight";
import { ChartBlockFrame } from "./ChartBlockFrame";
import { MapBlockBody } from "./MapBlockBody";
import { blockSqlRequestKey, buildBlockSqlPayload, resolveRunSqlUrl, runBlockSql } from "./runBlockSql";
import { getBlockNoteEditor } from "./blockNoteEditor";
import { chartTypeFromJsonRenderSpec } from "./pinnedChartModify";
import { isMapVizSpec, mapCountryOf } from "../mapKind";
import { useMapGeoClient } from "./mapGeo";
import { usePinnedChartChrome } from "./PinnedChartChrome";
import { usePinnedChartBlockModify } from "./usePinnedChartBlockModify";

/** Chart types `swapJsonRenderChartType` can render (no scatter). */
const JSON_RENDER_CHART_TYPES: ChartType[] = ["column", "bar", "line", "area", "pie"];

type JsonRenderChartBlockOptions = {
  apiBaseUrl?: string;
  colors: ThemeColors;
  queryResultBaseUrl?: string;
  runSqlUrl?: string;
  modifyChartUrl?: string;
  enableChartControls?: boolean;
  /** Workspace: adds an "Ask about this" shortcut to each chart's controls. */
  onAskAboutThis?: (chartId: string) => void;
  organizationId?: string;
  dashboardId?: string;
  headers?: Record<string, string>;
};

const EMPTY_HEADERS: Record<string, string> = {};
const SQL_KEY_PREFIX = "json-render-run-sql";

function mapRows(spec: unknown): Array<Record<string, unknown>> {
  if (!spec || typeof spec !== "object" || !("data" in spec)) return [];
  return Array.isArray(spec.data) ? spec.data : [];
}

function extractControlData(spec: unknown): {
  fields: string[];
  rows: Array<Record<string, unknown>>;
} {
  // Prefer nested chart props (where injectRows writes); fall back to top-level.
  const root = getRootElement(
    (spec ?? {}) as Parameters<typeof getRootElement>[0]
  );
  const nestedProps =
    root?.element?.props && typeof root.element.props === "object"
      ? (root.element.props as Record<string, unknown>)
      : null;
  const candidates: unknown[] = [];
  if (nestedProps) {
    if (Array.isArray(nestedProps.data)) candidates.push(nestedProps.data);
    if (Array.isArray(nestedProps.rows)) candidates.push(nestedProps.rows);
  }
  if (spec && typeof spec === "object") {
    const top = spec as { data?: unknown; rows?: unknown };
    if (Array.isArray(top.data)) candidates.push(top.data);
    if (Array.isArray(top.rows)) candidates.push(top.rows);
  }

  for (const data of candidates) {
    if (!Array.isArray(data) || data.length === 0) continue;
    // Chart series: array of objects
    if (data[0] && typeof data[0] === "object" && !Array.isArray(data[0])) {
      return {
        fields: Object.keys(data[0] as Record<string, unknown>),
        rows: data as Array<Record<string, unknown>>,
      };
    }
  }
  return { fields: [], rows: [] };
}

export function createJsonRenderChartBlockSpec({
  apiBaseUrl = "",
  colors,
  queryResultBaseUrl = "/api/query-results",
  runSqlUrl,
  modifyChartUrl,
  enableChartControls = true,
  onAskAboutThis,
  organizationId,
  dashboardId,
  headers = EMPTY_HEADERS,
}: JsonRenderChartBlockOptions) {
  return createReactBlockSpec(
    {
      type: "json-render-chart",
      propSchema: {
        jsonRenderSpec: {
          default: undefined,
          type: "string" as const,
        },
        chartId: {
          default: "",
        },
        title: {
          default: "Visualization",
        },
        description: {
          default: "",
        },
        rationale: {
          default: "",
        },
        question: {
          default: "",
        },
        sql: {
          default: "",
        },
        sqlParams: {
          default: "{}",
          type: "string" as const,
        },
        datasourceIds: {
          default: "[]",
          type: "string" as const,
        },
        tenantFieldName: {
          default: "",
        },
        previewTenantId: {
          default: "",
        },
        resultId: {
          default: "",
        },
        width: {
          default: "100%",
        },
        height: {
          default: 400,
        },
      },
      content: "none",
    },
    {
      render: (props) => {
        const { darkMode } = useThemeContext();
        const resolvedColors = getColorsForMode(colors, darkMode);
        const [loadError, setLoadError] = useState<string | null>(null);
        const [hydratedSpec, setHydratedSpec] = useState<unknown>(null);
        const [isLoading, setIsLoading] = useState(false);
        const lastSqlFetchKeyRef = useRef<string>("");
        const [lastUpdated, setLastUpdated] = useState<number | undefined>(undefined);

        const parsedSpec = useMemo(() => {
          if (!props.block.props.jsonRenderSpec) return null;

          try {
            const rawSpec = JSON.parse(props.block.props.jsonRenderSpec as string);
            return withJsonRenderResultId(
              rawSpec,
              props.block.props.resultId || undefined
            );
          } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Invalid JSON Render spec");
            return null;
          }
        }, [props.block.props.jsonRenderSpec, props.block.props.resultId]);

        const sqlParams = useMemo(() => {
          try {
            return JSON.parse(props.block.props.sqlParams || "{}") as Record<string, unknown>;
          } catch {
            return {};
          }
        }, [props.block.props.sqlParams]);

        const specForRenderer = useMemo(
          () => hydratedSpec ?? parsedSpec,
          [hydratedSpec, parsedSpec]
        );

        const datasourceIds = useMemo(() => {
          try {
            return JSON.parse(props.block.props.datasourceIds || "[]") as string[];
          } catch {
            return [];
          }
        }, [props.block.props.datasourceIds]);

        // The card sizes itself to its content; only a height the user set in chart settings is a minimum.
        const savedHeight = parseBlockHeight(props.block.props.height);
        const customMinHeight =
          savedHeight != null && savedHeight !== DEFAULT_CHART_HEIGHT ? savedHeight : undefined;
        const editor = getBlockNoteEditor(props);
        const isMap = isMapVizSpec(parsedSpec);
        const mapGeo = useMapGeoClient({ apiBaseUrl, headers, organizationId });

        const modify = usePinnedChartBlockModify({
          format: "json-render",
          block: props.block,
          editor,
          modifyChartUrl,
          enableChartControls,
          organizationId,
          dashboardId,
          headers,
          datasourceIds,
          sqlParams,
          currentJsonRenderSpec: hydratedSpec ?? parsedSpec,
        });
        const askChartId = props.block.props.chartId;
        const chrome = usePinnedChartChrome({
          modify,
          onAsk:
            onAskAboutThis && typeof askChartId === "string" && askChartId
              ? () => onAskAboutThis(askChartId)
              : undefined,
          colors: resolvedColors,
          disabled: isLoading,
          sqlParams,
          currentChartType: chartTypeFromJsonRenderSpec(specForRenderer),
          chartTypes: JSON_RENDER_CHART_TYPES,
          isMap,
          mapCountry: mapCountryOf(specForRenderer),
        });

        const hasSql = Boolean(props.block.props.sql) && datasourceIds.length > 0;

        const sqlUrl = resolveRunSqlUrl(runSqlUrl, apiBaseUrl);
        const sqlPayload = buildBlockSqlPayload({
          sql: props.block.props.sql,
          datasourceIds,
          dashboardId,
          sqlParams,
          tenantFieldName: props.block.props.tenantFieldName,
          previewTenantId: props.block.props.previewTenantId,
        });
        const sqlRequestKey = blockSqlRequestKey({
          keyPrefix: SQL_KEY_PREFIX,
          url: sqlUrl,
          payload: sqlPayload,
          headers,
        });

        /** Runs the block's SQL. `force` (map refresh) bypasses the 60 s block cache. */
        const fetchRows = async (force: boolean, isCancelled: () => boolean = () => false) => {
          if (!parsedSpec) return;
          setIsLoading(true);
          setLoadError(null);
          try {
            const { rows, fields } = await runBlockSql({
              url: sqlUrl,
              headers,
              organizationId,
              payload: sqlPayload,
              force,
              keyPrefix: SQL_KEY_PREFIX,
              errorMessage: "Failed to load visualization data",
            });

            if (!isCancelled()) {
              lastSqlFetchKeyRef.current = sqlRequestKey;
              setLastUpdated(Date.now());
              setHydratedSpec(hydrateSpecRows(parsedSpec, rows, fields));
            }
          } catch (err) {
            if (!isCancelled()) {
              setLoadError(
                err instanceof Error ? err.message : "Failed to load visualization data"
              );
              if (!force) setHydratedSpec(parsedSpec);
            }
            if (force) throw err;
          } finally {
            if (!isCancelled()) {
              setIsLoading(false);
            }
          }
        };

        useEffect(() => {
          if (!parsedSpec) return;

          if (!hasSql) {
            setHydratedSpec(parsedSpec);
            return;
          }

          // Same SQL/params: reuse hydrated rows onto a possibly type-swapped spec.
          // Do this before trusting inline data so chart-type swaps still work.
          if (!isMap && lastSqlFetchKeyRef.current === sqlRequestKey) {
            setHydratedSpec((prev: unknown) => {
              const { rows, fields } = extractControlData(prev);
              if (rows.length === 0 && hasInlineJsonRenderData(parsedSpec)) {
                return parsedSpec;
              }
              return injectRowsIntoJsonRenderSpec(parsedSpec, rows, fields);
            });
            return;
          }

          // Params/SQL changed (e.g. date-range modify). Prefer fresh inline rows from
          // the modify response when present; otherwise refetch.
          if (!isMap && hasInlineJsonRenderData(parsedSpec)) {
            lastSqlFetchKeyRef.current = sqlRequestKey;
            setHydratedSpec(parsedSpec);
            return;
          }

          let cancelled = false;
          void fetchRows(false, () => cancelled);
          return () => {
            cancelled = true;
          };
        }, [
          datasourceIds,
          sqlParams,
          parsedSpec,
          props.block.props.sql,
          props.block.props.tenantFieldName,
          props.block.props.previewTenantId,
        ]);

        const error = modify.error || loadError;

        if (!parsedSpec) {
          return (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                padding: "1rem",
                color: resolvedColors.error,
                background: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
                borderRadius: "0.75rem",
              }}
            >
              {error ?? "Invalid JSON Render specification"}
            </div>
          );
        }

        if (isLoading && !hydratedSpec) {
          return (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                padding: "1rem",
                color: resolvedColors.muted,
                background: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
                borderRadius: "0.75rem",
              }}
            >
              Loading visualization data...
            </div>
          );
        }

        if (error && !hydratedSpec) {
          return (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                padding: "1rem",
                color: resolvedColors.error,
                background: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
                borderRadius: "0.75rem",
              }}
            >
              {error}
            </div>
          );
        }

        if (isMap && isMapVizSpec(specForRenderer)) {
          return (
            <ChartBlockFrame
              title={props.block.props.title || "Map"}
              datasourceCount={datasourceIds.length}
              titleActions={chrome.titleActions}
              error={error}
              overlay={chrome.controls}
              height={resolveChartBlockHeight(props.block.props.height, "map")}
              colors={resolvedColors}
            >
              <MapBlockBody
                spec={specForRenderer}
                rows={mapRows(specForRenderer)}
                geo={mapGeo}
                colors={resolvedColors}
                lastUpdated={lastUpdated}
                onRefresh={hasSql ? () => fetchRows(true) : undefined}
              />
            </ChartBlockFrame>
          );
        }

        return (
          <div
            style={{
              width: "100%",
              minWidth: 0,
              display: "flex",
              justifyContent: "center",
              padding: "0.25rem 0",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "56rem",
                minHeight: customMinHeight ? `${customMinHeight}px` : undefined,
                boxSizing: "border-box",
                position: "relative",
              }}
            >
              {error ? (
                <div
                  style={{
                    marginBottom: "0.5rem",
                    fontSize: "0.75rem",
                    color: resolvedColors.error,
                  }}
                >
                  {error}
                </div>
              ) : null}
              <PersistedSpecRenderer
                spec={specForRenderer}
                queryResultBaseUrl={queryResultBaseUrl}
                requestHeaders={headers}
                headerActions={chrome.titleActions}
              />
              {chrome.controls}
            </div>
          </div>
        );
      },
    }
  );
}
