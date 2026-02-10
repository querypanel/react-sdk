"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useState } from "react";
import { VizSpecRenderer, type VizSpec } from "../VizSpecRenderer";
import type { ThemeColors } from "../types";

type ChartBlockOptions = {
  apiBaseUrl: string;
  token: string;
  colors: ThemeColors;
};

export function createChartBlockSpec({ apiBaseUrl, token, colors }: ChartBlockOptions) {
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
      },
      content: "none",
    },
    {
      render: (props) => {
        const [data, setData] = useState<Array<Record<string, unknown>> | null>(null);
        const [error, setError] = useState<string | null>(null);
        const [isLoading, setIsLoading] = useState(false);

        const parsedSpec = useMemo(() => {
          if (!props.block.props.chartSpec) return null;
          try {
            return JSON.parse(props.block.props.chartSpec) as VizSpec & {
              data?: Array<Record<string, unknown>>;
            };
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid chart spec");
            return null;
          }
        }, [props.block.props.chartSpec]);

        const sqlParams = useMemo(() => {
          try {
            return JSON.parse(props.block.props.sqlParams || "{}") as Record<string, unknown>;
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

        useEffect(() => {
          if (!parsedSpec) return;
          if (Array.isArray(parsedSpec.data) && parsedSpec.data.length > 0) {
            setData(parsedSpec.data);
            return;
          }

          if (!props.block.props.sql || datasourceIds.length === 0) {
            setData([]);
            return;
          }

          let cancelled = false;
          const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
              const response = await fetch(`${apiBaseUrl}/query/run-sql`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  sql: props.block.props.sql,
                  datasourceIds,
                  params: sqlParams,
                }),
              });

              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(payload?.error || "Failed to load chart data");
              }

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
        }, [apiBaseUrl, token, datasourceIds, sqlParams, parsedSpec, props.block.props.sql]);

        if (!parsedSpec) {
          return (
            <div style={{ padding: "1rem", color: colors.error }}>
              Invalid chart specification
            </div>
          );
        }

        if (isLoading && !data) {
          return (
            <div style={{ padding: "1rem", color: colors.muted }}>
              Loading chart data...
            </div>
          );
        }

        if (error) {
          return (
            <div style={{ padding: "1rem", color: colors.error }}>
              {error}
            </div>
          );
        }

        return (
          <div style={{ padding: "0.5rem" }}>
            <VizSpecRenderer
              spec={parsedSpec as VizSpec}
              data={data ?? []}
              colors={colors}
            />
          </div>
        );
      },
    }
  );
}
