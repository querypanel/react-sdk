/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useState } from "react";
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

type JsonRenderChartBlockOptions = {
  apiBaseUrl?: string;
  colors: ThemeColors;
  queryResultBaseUrl?: string;
  runSqlUrl?: string;
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

export function createJsonRenderChartBlockSpec({
  apiBaseUrl = "",
  colors,
  queryResultBaseUrl = "/api/query-results",
  runSqlUrl,
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

        const chartHeight = (() => {
          const raw = props.block.props.height;
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string") {
            const parsed = Number.parseInt(raw, 10);
            if (Number.isFinite(parsed)) return parsed;
          }
          return 400;
        })();

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
