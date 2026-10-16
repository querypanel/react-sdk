/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { VizSpecRenderer, type VizSpec } from "../VizSpecRenderer";
import { useThemeContext } from "../../context/ThemeContext";
import { getColorsForMode } from "../../themes";
import type { ChartType, ThemeColors } from "../../types";
import { runDedupedRequest } from "../../utils/requestDedup";
import { resolveChartBlockHeight } from "./chartBlockHeight";
import {
  PinnedChartControls,
  type PinnedChartControlsApply,
} from "./PinnedChartControls";
import {
  callPinnedChartModify,
  chartTypeFromVizSpec,
} from "./pinnedChartModify";

type ChartBlockOptions = {
  apiBaseUrl: string;
  colors: ThemeColors;
  /** Override URL for run-sql (e.g. /api/dashboards/run-sql for admin). If not set, uses apiBaseUrl + /query/run-sql */
  runSqlUrl?: string;
  /** Override URL for pinned-chart modify (admin: /api/dashboards/modify-chart). */
  modifyChartUrl?: string;
  /** Show date-range / chart-type controls when modifyChartUrl is set. Default true. */
  enableChartControls?: boolean;
  organizationId?: string;
  dashboardId?: string;
  headers?: Record<string, string>;
};

const EMPTY_HEADERS: Record<string, string> = {};

type ChartBlockPropsSnapshot = {
  chartSpec: string;
  sql: string;
  sqlParams: string;
  rationale: string;
  title: string;
  question: string;
};

function getHeadersSignature(headers: Record<string, string>) {
  return JSON.stringify(
    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  );
}

function isVizSpec(value: unknown): value is VizSpec {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "chart" || kind === "table" || kind === "metric";
}

export function createChartBlockSpec({
  apiBaseUrl,
  colors,
  runSqlUrl,
  modifyChartUrl,
  enableChartControls = true,
  organizationId,
  dashboardId,
  headers = EMPTY_HEADERS,
}: ChartBlockOptions) {
  return createReactBlockSpec(
    {
      type: "chart",
      propSchema: {
        chartSpec: {
          default: undefined,
          type: "string" as const,
        },
        title: {
          default: "Chart",
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
        tenantId: {
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
        const [data, setData] = useState<Array<Record<string, unknown>> | null>(null);
        const [error, setError] = useState<string | null>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [isModifying, setIsModifying] = useState(false);
        const [undoSnapshot, setUndoSnapshot] = useState<ChartBlockPropsSnapshot | null>(
          null
        );
        const modifyingRef = useRef(false);

        const parsedSpec = useMemo(() => {
          if (!props.block.props.chartSpec) return null;
          try {
            const rawSpec = JSON.parse(props.block.props.chartSpec) as VizSpec & {
              data?: Array<Record<string, unknown>>;
            };

            if (!isVizSpec(rawSpec)) {
              throw new Error("Unsupported chart specification");
            }
            return {
              spec: rawSpec,
              embeddedData: Array.isArray(rawSpec.data) ? rawSpec.data : [],
            };
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid chart spec");
            return null;
          }
        }, [props.block.props.chartSpec]);

        const chartHeight = resolveChartBlockHeight(
          props.block.props.height,
          parsedSpec?.spec.kind
        );

        const sqlParams = useMemo(() => {
          try {
            return JSON.parse(props.block.props.sqlParams || "{}") as Record<
              string,
              unknown
            >;
          } catch {
            return {};
          }
        }, [props.block.props.sqlParams]);

        const datasourceIds = useMemo(() => {
          try {
            return JSON.parse(props.block.props.datasourceIds || "[]") as string[];
          } catch {
            return [];
          }
        }, [props.block.props.datasourceIds]);

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

        // biome-ignore lint/correctness/useExhaustiveDependencies: values come from createChartBlockSpec closure
        useEffect(() => {
          if (!parsedSpec) return;
          if (Array.isArray(parsedSpec.embeddedData) && parsedSpec.embeddedData.length > 0) {
            setData(parsedSpec.embeddedData);
            return;
          }

          if (!props.block.props.sql || datasourceIds.length === 0) {
            setData([]);
            return;
          }

          const url = runSqlUrl ?? `${apiBaseUrl.replace(/\/+$/, "")}/query/run-sql`;
          const tenantFieldName = props.block.props.tenantFieldName?.trim() || undefined;
          const previewTenantId =
            props.block.props.previewTenantId?.trim() ||
            props.block.props.tenantId?.trim() ||
            undefined;
          const requestPayload = {
            sql: props.block.props.sql,
            datasourceIds,
            ...(dashboardId ? { dashboardId } : {}),
            params: sqlParams,
            ...(tenantFieldName && { tenantFieldName }),
            ...(previewTenantId && { previewTenantId }),
          };
          const requestKey = `run-sql:${url}:${JSON.stringify(requestPayload)}:${getHeadersSignature(headers)}`;

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
                    throw new Error(parsed?.error || "Failed to load chart data");
                  }
                  return parsed;
                },
                { cacheMs: 60_000 }
              );

              if (!cancelled) {
                setData(Array.isArray(payload?.rows) ? payload.rows : []);
              }
            } catch (err) {
              if (!cancelled) {
                setError(err instanceof Error ? err.message : "Failed to load chart data");
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
          props.block.props.tenantId,
        ]);

        const hasEmbeddedData =
          Array.isArray(parsedSpec?.embeddedData) && parsedSpec.embeddedData.length > 0;
        const effectiveData =
          hasEmbeddedData && parsedSpec ? parsedSpec.embeddedData : (data ?? []);

        const currentChartType: ChartType | "" = chartTypeFromVizSpec(parsedSpec?.spec);

        const snapshotProps = (): ChartBlockPropsSnapshot => ({
          chartSpec: props.block.props.chartSpec || "",
          sql: props.block.props.sql || "",
          sqlParams: props.block.props.sqlParams || "{}",
          rationale: props.block.props.rationale || "",
          title: props.block.props.title || "",
          question: props.block.props.question || "",
        });

        const applyPropsUpdate = (next: Partial<ChartBlockPropsSnapshot>) => {
          editor?.updateBlock?.(props.block, {
            props: {
              ...next,
            },
          });
        };

        const handleControlsApply = async (options: PinnedChartControlsApply) => {
          if (!modifyChartUrl || !editor?.updateBlock || modifyingRef.current) return;
          if (!options.sqlModifications && !options.vizModifications) return;

          modifyingRef.current = true;
          setIsModifying(true);
          setError(null);
          const previous = snapshotProps();

          try {
            const question =
              props.block.props.question?.trim() ||
              props.block.props.title?.trim() ||
              "Chart";
            const tenantFieldName =
              props.block.props.tenantFieldName?.trim() || undefined;
            const previewTenantId =
              props.block.props.previewTenantId?.trim() ||
              props.block.props.tenantId?.trim() ||
              undefined;

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

            const nextSpec =
              result.chart?.vizSpec ??
              result.chartSpec ??
              (parsedSpec?.spec ? { ...parsedSpec.spec } : null);

            if (!nextSpec || !isVizSpec(nextSpec)) {
              throw new Error("Modify did not return a VizSpec chart");
            }

            const rows = Array.isArray(result.rows) ? result.rows : effectiveData;
            const specWithData = {
              ...nextSpec,
              data: rows,
            };

            setUndoSnapshot(previous);
            applyPropsUpdate({
              chartSpec: JSON.stringify(specWithData),
              sql: typeof result.sql === "string" ? result.sql : previous.sql,
              sqlParams: JSON.stringify(result.params ?? sqlParams),
              rationale:
                typeof result.rationale === "string" && result.rationale
                  ? result.rationale
                  : previous.rationale,
              title:
                (nextSpec as { description?: string; title?: string }).description ||
                (nextSpec as { title?: string }).title ||
                previous.title,
            });
            setData(rows);
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
            const raw = JSON.parse(undoSnapshot.chartSpec) as VizSpec & {
              data?: Array<Record<string, unknown>>;
            };
            if (Array.isArray(raw.data)) {
              setData(raw.data);
            }
          } catch {
            // ignore — run-sql effect will refresh
          }
        };

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
              Invalid chart specification
            </div>
          );
        }

        if (isLoading && !hasEmbeddedData && !data) {
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
              Loading chart data...
            </div>
          );
        }

        if (error && !parsedSpec) {
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
                minWidth: 0,
                padding: "0.75rem",
                boxSizing: "border-box",
                background: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
                borderRadius: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  color: resolvedColors.text,
                }}
              >
                <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  {props.block.props.title || "Chart"}
                </div>
                <div style={{ fontSize: "0.75rem", color: resolvedColors.muted }}>
                  {datasourceIds.length > 0
                    ? `${datasourceIds.length} datasource${datasourceIds.length > 1 ? "s" : ""}`
                    : ""}
                </div>
              </div>

              {controlsEnabled ? (
                <PinnedChartControls
                  fields={
                    effectiveData[0]
                      ? Object.keys(effectiveData[0])
                      : []
                  }
                  rows={effectiveData}
                  disabled={isModifying || isLoading}
                  canUndo={Boolean(undoSnapshot)}
                  colors={resolvedColors}
                  currentChartType={currentChartType}
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

              <div
                style={{
                  width: "100%",
                  minWidth: 0,
                  height: `${chartHeight}px`,
                  borderRadius: "0.5rem",
                  background: resolvedColors.background,
                  border: `1px solid ${resolvedColors.border}`,
                  padding: "0.5rem",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <VizSpecRenderer
                  spec={parsedSpec.spec}
                  data={effectiveData}
                  colors={resolvedColors}
                  chartHeight="100%"
                />
              </div>
            </div>
          </div>
        );
      },
    }
  );
}
