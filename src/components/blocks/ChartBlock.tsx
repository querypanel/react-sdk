/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useState } from "react";
import { VizSpecRenderer, type VizSpec } from "../VizSpecRenderer";
import { useThemeContext } from "../../context/ThemeContext";
import { getColorsForMode } from "../../themes";
import type { ThemeColors } from "../../types";
import { resolveChartBlockHeight } from "./chartBlockHeight";
import { ChartBlockFrame } from "./ChartBlockFrame";
import { MapBlockBody } from "./MapBlockBody";
import { buildBlockSqlPayload, resolveRunSqlUrl, runBlockSql } from "./runBlockSql";
import { isVizSpec } from "../vizSpecGuard";
import { getBlockNoteEditor } from "./blockNoteEditor";
import { chartTypeFromVizSpec } from "./pinnedChartModify";
import { isMapVizSpec, mapCountryOf } from "../mapKind";
import { useMapGeoClient } from "./mapGeo";
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
  /** Workspace: adds an "Ask about this" shortcut to each chart's controls. */
  onAskAboutThis?: (chartId: string) => void;
  organizationId?: string;
  dashboardId?: string;
  headers?: Record<string, string>;
};

const EMPTY_HEADERS: Record<string, string> = {};

export function createChartBlockSpec({
  apiBaseUrl,
  colors,
  runSqlUrl,
  modifyChartUrl,
  enableChartControls = true,
  onAskAboutThis,
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
        /** Server-stored query behind `sql` (from generate / modify); empty for older blocks. */
        queryId: {
          default: "",
        },
        /** Dashboard chart row (sdk_charts) holding this chart's query; set when the dashboard is saved. */
        savedChartId: {
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
        const [lastUpdated, setLastUpdated] = useState<number | undefined>(undefined);
        // After a manual refresh the fetched rows win over rows embedded in the spec.
        const [refreshed, setRefreshed] = useState(false);

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

        const mapGeo = useMapGeoClient({ apiBaseUrl, headers, organizationId });

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
          currentChartType: chartTypeFromVizSpec(parsedSpec?.spec),
          isMap: isMapVizSpec(parsedSpec?.spec),
          mapCountry: mapCountryOf(parsedSpec?.spec),
        });

        const hasSql = Boolean(props.block.props.sql) && datasourceIds.length > 0;

        /** Runs the block's SQL. `force` (map refresh) bypasses the 60 s block cache. */
        const fetchRows = async (force: boolean, isCancelled: () => boolean = () => false) => {
          setIsLoading(true);
          setLoadError(null);
          try {
            const { rows } = await runBlockSql({
              url: resolveRunSqlUrl(runSqlUrl, apiBaseUrl),
              headers,
              organizationId,
              payload: buildBlockSqlPayload({
                sql: props.block.props.sql,
                datasourceIds,
                dashboardId,
                queryId: props.block.props.queryId,
                savedChartId: props.block.props.savedChartId,
                sqlParams,
                tenantFieldName: props.block.props.tenantFieldName,
                previewTenantId:
                  props.block.props.previewTenantId?.trim() || props.block.props.tenantId,
              }),
              force,
              keyPrefix: "run-sql",
              errorMessage: "Failed to load chart data",
            });

            if (!isCancelled()) {
              setData(rows);
              setLastUpdated(Date.now());
              if (force) setRefreshed(true);
            }
          } catch (err) {
            if (!isCancelled()) {
              setLoadError(err instanceof Error ? err.message : "Failed to load chart data");
            }
            if (force) throw err;
          } finally {
            if (!isCancelled()) {
              setIsLoading(false);
            }
          }
        };

        // biome-ignore lint/correctness/useExhaustiveDependencies: values come from createChartBlockSpec closure
        useEffect(() => {
          if (!parsedSpec) return;
          setRefreshed(false);
          if (Array.isArray(parsedSpec.embeddedData) && parsedSpec.embeddedData.length > 0) {
            setData(parsedSpec.embeddedData);
            setLastUpdated(Date.now());
            return;
          }

          if (!hasSql) {
            setData([]);
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
          props.block.props.tenantId,
        ]);

        const hasEmbeddedData =
          Array.isArray(parsedSpec?.embeddedData) && parsedSpec.embeddedData.length > 0;
        const effectiveData =
          hasEmbeddedData && parsedSpec && !refreshed ? parsedSpec.embeddedData : (data ?? []);

        const error = modify.error || loadError;

        if (!parsedSpec) {
          // A stored chart's spec comes from its row on load: until then it is loading, not invalid.
          const awaitingRow =
            !error && Boolean(props.block.props.savedChartId) && !props.block.props.chartSpec;
          return (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                padding: "1rem",
                color: awaitingRow ? resolvedColors.muted : resolvedColors.error,
                background: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
                borderRadius: "0.75rem",
              }}
            >
              {awaitingRow ? "Loading chart data..." : "Invalid chart specification"}
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
            {isMapVizSpec(parsedSpec.spec) ? (
              <MapBlockBody
                spec={parsedSpec.spec}
                rows={effectiveData}
                geo={mapGeo}
                colors={resolvedColors}
                lastUpdated={lastUpdated}
                onRefresh={hasSql ? () => fetchRows(true) : undefined}
              />
            ) : (
              <VizSpecRenderer
                spec={parsedSpec.spec}
                data={effectiveData}
                colors={resolvedColors}
                chartHeight="100%"
              />
            )}
          </ChartBlockFrame>
        );
      },
    }
  );
}
