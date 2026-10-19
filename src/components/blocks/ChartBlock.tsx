/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useState } from "react";
import { VizSpecRenderer, type VizSpec } from "../VizSpecRenderer";
import { useThemeContext } from "../../context/ThemeContext";
import { getColorsForMode } from "../../themes";
import type { ThemeColors } from "../../types";
import { runDedupedRequest } from "../../utils/requestDedup";
import { resolveChartBlockHeight } from "./chartBlockHeight";
import { ChartBlockFrame } from "./ChartBlockFrame";
import { isVizSpec } from "../vizSpecGuard";
import { getBlockNoteEditor } from "./blockNoteEditor";
import { chartTypeFromVizSpec } from "./pinnedChartModify";
import { usePinnedChartChrome } from "./PinnedChartChrome";
import { usePinnedChartBlockModify } from "./usePinnedChartBlockModify";

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

function getHeadersSignature(headers: Record<string, string>) {
  return JSON.stringify(
    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  );
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
        chartId: {
          default: "",
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
        const [loadError, setLoadError] = useState<string | null>(null);
        const [isLoading, setIsLoading] = useState(false);

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
            setLoadError(err instanceof Error ? err.message : "Invalid chart spec");
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

        const editor = getBlockNoteEditor(props);

        const modify = usePinnedChartBlockModify({
          format: "vizspec",
          block: props.block,
          editor,
          modifyChartUrl,
          enableChartControls,
          organizationId,
          dashboardId,
          headers,
          datasourceIds,
          sqlParams,
          currentVizSpec: parsedSpec?.spec ?? null,
          fallbackRows:
            Array.isArray(parsedSpec?.embeddedData) && parsedSpec.embeddedData.length > 0
              ? parsedSpec.embeddedData
              : (data ?? []),
        });
        const chrome = usePinnedChartChrome({
          modify,
          colors: resolvedColors,
          disabled: isLoading,
          sqlParams,
          currentChartType: chartTypeFromVizSpec(parsedSpec?.spec),
        });

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
                setLoadError(err instanceof Error ? err.message : "Failed to load chart data");
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

        return (
          <ChartBlockFrame
            title={props.block.props.title || "Chart"}
            datasourceCount={datasourceIds.length}
            titleActions={chrome.titleActions}
            error={error}
            overlay={chrome.controls}
            height={chartHeight}
            colors={resolvedColors}
          >
            <VizSpecRenderer
              spec={parsedSpec.spec}
              data={effectiveData}
              colors={resolvedColors}
              chartHeight="100%"
            />
          </ChartBlockFrame>
        );
      },
    }
  );
}
