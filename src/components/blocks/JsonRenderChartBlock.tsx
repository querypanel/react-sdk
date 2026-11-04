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
  injectRowsIntoJsonRenderSpec,
  withJsonRenderResultId,
} from "../generative-ui/specData";
import { runDedupedRequest } from "../../utils/requestDedup";
import { DEFAULT_CHART_HEIGHT, parseBlockHeight } from "./chartBlockHeight";
import { getBlockNoteEditor } from "./blockNoteEditor";
import { chartTypeFromJsonRenderSpec } from "./pinnedChartModify";
import { chartTypesForSpec } from "../mapKind";
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

function getHeadersSignature(headers: Record<string, string>) {
  return JSON.stringify(
    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  );
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
          chartTypes: chartTypesForSpec(specForRenderer, JSON_RENDER_CHART_TYPES),
        });

        useEffect(() => {
          if (!parsedSpec) return;

          if (!props.block.props.sql || datasourceIds.length === 0) {
            setHydratedSpec(parsedSpec);
            return;
          }

          const url = runSqlUrl ?? `${apiBaseUrl.replace(/\/+$/, "")}/query/run-sql`;
          const tenantFieldName = props.block.props.tenantFieldName?.trim() || undefined;
          const previewTenantId = props.block.props.previewTenantId?.trim() || undefined;
          const requestPayload = {
            sql: props.block.props.sql,
            datasourceIds,
            ...(dashboardId ? { dashboardId } : {}),
            params: sqlParams,
            ...(tenantFieldName ? { tenantFieldName } : {}),
            ...(previewTenantId ? { previewTenantId } : {}),
          };
          const requestKey = `json-render-run-sql:${url}:${JSON.stringify(
            requestPayload
          )}:${getHeadersSignature(headers)}`;

          // Same SQL/params: reuse hydrated rows onto a possibly type-swapped spec.
          // Do this before trusting inline data so chart-type swaps still work.
          if (lastSqlFetchKeyRef.current === requestKey) {
            setHydratedSpec((prev: unknown) => {
              const { rows, fields } = extractControlData(prev);
              if (rows.length === 0 && hasInlineJsonRenderData(parsedSpec)) {
                return parsedSpec;
              }
              if (rows.length === 0) {
                return injectRowsIntoJsonRenderSpec(parsedSpec, [], fields);
              }
              return injectRowsIntoJsonRenderSpec(parsedSpec, rows, fields);
            });
            return;
          }

          // Params/SQL changed (e.g. date-range modify). Prefer fresh inline rows from
          // the modify response when present; otherwise refetch.
          if (hasInlineJsonRenderData(parsedSpec)) {
            lastSqlFetchKeyRef.current = requestKey;
            setHydratedSpec(parsedSpec);
            return;
          }

          let cancelled = false;
          const fetchData = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
              const payload = await runDedupedRequest(
                requestKey,
                async () => {
                  const response = await fetch(url, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(organizationId ? { "x-organization-id": organizationId } : {}),
                      ...headers,
                    },
                    body: JSON.stringify(requestPayload),
                  });

                  const parsed = await response.json().catch(() => ({}));
                  if (!response.ok) {
                    throw new Error(parsed?.error || "Failed to load visualization data");
                  }
                  return parsed;
                },
                { cacheMs: 60_000 }
              );

              if (!cancelled) {
                const rows = Array.isArray(payload?.rows)
                  ? (payload.rows as Array<Record<string, unknown>>)
                  : [];
                const fields = Array.isArray(payload?.fields)
                  ? (payload.fields as string[])
                  : [];
                lastSqlFetchKeyRef.current = requestKey;
                setHydratedSpec(injectRowsIntoJsonRenderSpec(parsedSpec, rows, fields));
              }
            } catch (err) {
              if (!cancelled) {
                setLoadError(
                  err instanceof Error ? err.message : "Failed to load visualization data"
                );
                setHydratedSpec(parsedSpec);
              }
            } finally {
              if (!cancelled) {
                setIsLoading(false);
              }
            }
          };

          void fetchData();
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
