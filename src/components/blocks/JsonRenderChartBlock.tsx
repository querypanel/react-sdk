/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeColors } from "../../types";
import { useThemeContext } from "../../context/ThemeContext";
import { getColorsForMode } from "../../themes";
import { PersistedSpecRenderer } from "../generative-ui/PersistedSpecRenderer";
import {
  hasInlineJsonRenderData,
  injectRowsIntoJsonRenderSpec,
  withJsonRenderResultId,
} from "../generative-ui/specData";
import { runDedupedRequest } from "../../utils/requestDedup";
import { parseBlockHeight } from "./chartBlockHeight";
import {
  PinnedChartControls,
  type PinnedChartControlsApply,
} from "./PinnedChartControls";
import {
  callPinnedChartModify,
  swapJsonRenderChartType,
} from "./pinnedChartModify";

type JsonRenderChartBlockOptions = {
  apiBaseUrl?: string;
  colors: ThemeColors;
  queryResultBaseUrl?: string;
  runSqlUrl?: string;
  modifyChartUrl?: string;
  enableChartControls?: boolean;
  organizationId?: string;
  dashboardId?: string;
  headers?: Record<string, string>;
};

type JsonRenderPropsSnapshot = {
  jsonRenderSpec: string;
  sql: string;
  sqlParams: string;
  rationale: string;
  title: string;
  question: string;
  resultId: string;
};

const EMPTY_HEADERS: Record<string, string> = {};

function getHeadersSignature(headers: Record<string, string>) {
  return JSON.stringify(
    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  );
}

export function createJsonRenderChartBlockSpec({
  apiBaseUrl = "",
  colors,
  queryResultBaseUrl = "/api/query-results",
  runSqlUrl,
  modifyChartUrl,
  enableChartControls = true,
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
        const [error, setError] = useState<string | null>(null);
        const [hydratedSpec, setHydratedSpec] = useState<unknown>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [isModifying, setIsModifying] = useState(false);
        const [undoSnapshot, setUndoSnapshot] = useState<JsonRenderPropsSnapshot | null>(
          null
        );
        const modifyingRef = useRef(false);

        const parsedSpec = useMemo(() => {
          if (!props.block.props.jsonRenderSpec) return null;

          try {
            const rawSpec = JSON.parse(props.block.props.jsonRenderSpec as string);
            return withJsonRenderResultId(
              rawSpec,
              props.block.props.resultId || undefined
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON Render spec");
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

        const chartHeight = parseBlockHeight(props.block.props.height) ?? 400;

        const editor = (
          props as {
            editor?: {
              isEditable?: boolean;
              updateBlock?: (
                block: unknown,
                update: { props: Record<string, unknown> }
              ) => void;
            };
          }
        ).editor;

        const controlsEnabled =
          Boolean(enableChartControls && modifyChartUrl) &&
          Boolean(editor?.isEditable !== false) &&
          Boolean(editor?.updateBlock) &&
          Boolean(props.block.props.sql) &&
          datasourceIds.length > 0;

        const snapshotProps = (): JsonRenderPropsSnapshot => ({
          jsonRenderSpec: props.block.props.jsonRenderSpec || "",
          sql: props.block.props.sql || "",
          sqlParams: props.block.props.sqlParams || "{}",
          rationale: props.block.props.rationale || "",
          title: props.block.props.title || "",
          question: props.block.props.question || "",
          resultId: props.block.props.resultId || "",
        });

        const applyPropsUpdate = (next: Partial<JsonRenderPropsSnapshot>) => {
          editor?.updateBlock?.(props.block, { props: { ...next } });
        };

        const handleControlsApply = async (options: PinnedChartControlsApply) => {
          if (!modifyChartUrl || !editor?.updateBlock || modifyingRef.current) return;
          if (!options.sqlModifications && !options.vizModifications) return;

          modifyingRef.current = true;
          setIsModifying(true);
          setError(null);
          const previous = snapshotProps();

          try {
            // Viz-only: swap json-render chart element locally (no SQL regen).
            if (options.vizModifications?.chartType && !options.sqlModifications) {
              const swapped = swapJsonRenderChartType(
                hydratedSpec ?? parsedSpec,
                options.vizModifications.chartType
              );
              if (!swapped) {
                throw new Error("Chart type is not supported for this visualization");
              }
              setUndoSnapshot(previous);
              applyPropsUpdate({
                jsonRenderSpec: JSON.stringify(swapped),
                resultId: "",
              });
              setHydratedSpec(swapped);
              return;
            }

            const question =
              props.block.props.question?.trim() ||
              props.block.props.title?.trim() ||
              "Chart";
            const tenantFieldName =
              props.block.props.tenantFieldName?.trim() || undefined;
            const previewTenantId =
              props.block.props.previewTenantId?.trim() || undefined;

            const result = await callPinnedChartModify(
              modifyChartUrl,
              {
                sql: props.block.props.sql,
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

            const rows = Array.isArray(result.rows) ? result.rows : [];
            const fields = Array.isArray(result.fields) ? result.fields : [];
            let nextSpec: unknown = hydratedSpec ?? parsedSpec;

            if (options.vizModifications?.chartType) {
              const swapped = swapJsonRenderChartType(
                nextSpec,
                options.vizModifications.chartType
              );
              if (swapped) nextSpec = swapped;
            }

            nextSpec = injectRowsIntoJsonRenderSpec(nextSpec, rows, fields);

            setUndoSnapshot(previous);
            applyPropsUpdate({
              jsonRenderSpec: JSON.stringify(nextSpec),
              sql: typeof result.sql === "string" ? result.sql : previous.sql,
              sqlParams: JSON.stringify(result.params ?? sqlParams),
              rationale:
                typeof result.rationale === "string" && result.rationale
                  ? result.rationale
                  : previous.rationale,
              resultId: "",
            });
            setHydratedSpec(nextSpec);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to modify chart");
          } finally {
            modifyingRef.current = false;
            setIsModifying(false);
          }
        };

        const handleUndo = () => {
          if (!undoSnapshot || !editor?.updateBlock) return;
          applyPropsUpdate(undoSnapshot);
          setUndoSnapshot(null);
          try {
            setHydratedSpec(JSON.parse(undoSnapshot.jsonRenderSpec));
          } catch {
            setHydratedSpec(null);
          }
        };

        useEffect(() => {
          if (!parsedSpec) return;
          if (hasInlineJsonRenderData(parsedSpec)) {
            setHydratedSpec(parsedSpec);
            return;
          }

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

          let cancelled = false;
          const fetchData = async () => {
            setIsLoading(true);
            setError(null);
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
                setHydratedSpec(injectRowsIntoJsonRenderSpec(parsedSpec, rows, fields));
              }
            } catch (err) {
              if (!cancelled) {
                setError(
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

        const controlFields = (() => {
          const base = hydratedSpec ?? parsedSpec;
          if (base && typeof base === "object") {
            const data = (base as { data?: unknown }).data;
            if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
              return Object.keys(data[0] as Record<string, unknown>);
            }
          }
          return [] as string[];
        })();

        const controlRows = (() => {
          const base = hydratedSpec ?? parsedSpec;
          if (base && typeof base === "object") {
            const data = (base as { data?: unknown }).data;
            if (Array.isArray(data)) {
              return data as Array<Record<string, unknown>>;
            }
          }
          return [] as Array<Record<string, unknown>>;
        })();

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
                minHeight: `${chartHeight}px`,
                boxSizing: "border-box",
              }}
            >
              {controlsEnabled ? (
                <PinnedChartControls
                  fields={controlFields}
                  rows={controlRows}
                  disabled={isModifying || isLoading}
                  canUndo={Boolean(undoSnapshot)}
                  colors={resolvedColors}
                  onApply={handleControlsApply}
                  onUndo={handleUndo}
                />
              ) : null}
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
              />
            </div>
          </div>
        );
      },
    }
  );
}
