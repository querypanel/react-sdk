"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { useThemeContext } from "../../context/ThemeContext";
import { useGenerativeUIConfig } from "./provider";
import { normalizeRowsForJsonRenderChart } from "./specData";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function getSurfaceColors(darkMode: boolean) {
  return darkMode
    ? {
        text: "#f8fafc",
        muted: "#94a3b8",
        border: "#334155",
        background: "#020617",
        panel: "#0f172a",
      }
    : {
        text: "#0f172a",
        muted: "#64748b",
        border: "#e2e8f0",
        background: "#ffffff",
        panel: "#f8fafc",
      };
}

function formatTooltipValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2,
    }).format(value);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "—";
    if (Number.isFinite(Number(normalized))) {
      return formatTooltipValue(Number(normalized));
    }
    return normalized;
  }
  return String(value);
}

function getTooltipStyles(colors: ReturnType<typeof getSurfaceColors>, darkMode: boolean) {
  return {
    contentStyle: {
      backgroundColor: darkMode ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
      border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.28)" : "rgba(15, 23, 42, 0.08)"}`,
      borderRadius: 10,
      boxShadow: darkMode
        ? "0 18px 48px rgba(2, 6, 23, 0.55)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)",
      color: colors.text,
      fontSize: 12,
      lineHeight: 1.45,
      padding: "8px 10px",
    },
    itemStyle: {
      color: colors.text,
      fontSize: 12,
      padding: 0,
    },
    labelStyle: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: 600,
      marginBottom: 4,
    },
    cursor: {
      fill: darkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.16)",
    },
  } as const;
}

function useResultData(resultId?: string | null) {
  const { queryResultBaseUrl } = useGenerativeUIConfig();
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!resultId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchRows = async () => {
      try {
        const response = await fetch(
          `${queryResultBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(resultId)}`,
          { credentials: "include" },
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string" ? payload.error : "Failed to load result data"
          );
        }

        if (!cancelled) {
          setRows(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load result data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchRows();
    return () => {
      cancelled = true;
    };
  }, [queryResultBaseUrl, resultId]);

  return { rows, loading, error };
}

function ChartShell({
  title,
  children,
}: {
  title?: string | null;
  children: React.ReactNode;
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "0.75rem",
        background: colors.panel,
        padding: "0.75rem",
      }}
    >
      {title ? (
        <div
          style={{
            marginBottom: "0.5rem",
            color: colors.text,
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function MessageState({
  title,
  message,
  error,
}: {
  title?: string | null;
  message: string;
  error?: boolean;
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);

  return (
    <ChartShell title={title}>
      <div
        style={{
          minHeight: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: error ? "#ef4444" : colors.muted,
          background: colors.background,
          border: `1px dashed ${colors.border}`,
          borderRadius: "0.5rem",
          padding: "1rem",
          textAlign: "center",
        }}
      >
        {message}
      </div>
    </ChartShell>
  );
}

export function MetricCard({
  props,
}: {
  props: { label: string; value: string; description?: string | null };
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "0.75rem",
        background: colors.panel,
        padding: "1rem",
      }}
    >
      <div style={{ color: colors.muted, fontSize: "0.875rem" }}>{props.label}</div>
      <div
        style={{
          color: colors.text,
          fontWeight: 700,
          fontSize: "1.875rem",
          marginTop: "0.25rem",
        }}
      >
        {props.value}
      </div>
      {props.description ? (
        <div style={{ color: colors.muted, fontSize: "0.75rem", marginTop: "0.5rem" }}>
          {props.description}
        </div>
      ) : null}
    </div>
  );
}

export function DataTable({
  props,
}: {
  props: {
    resultId?: string | null;
    headers?: string[];
    rows?: string[][];
    caption?: string | null;
  };
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);
  const { rows, loading, error } = useResultData(
    props.rows && props.rows.length > 0 ? null : props.resultId
  );

  if (loading) return <MessageState title={props.caption} message="Loading data..." />;
  if (error) return <MessageState title={props.caption} message={error} error />;

  const tableHeaders =
    props.headers ??
    (rows && rows.length > 0 ? Object.keys(rows[0]) : []);

  const tableRows =
    rows?.map((row) => tableHeaders.map((header) => String(row[header] ?? ""))) ??
    props.rows ??
    [];

  return (
    <ChartShell title={props.caption}>
      <div
        style={{
          overflowX: "auto",
          border: `1px solid ${colors.border}`,
          borderRadius: "0.5rem",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", color: colors.text }}>
          <thead style={{ background: colors.background }}>
            <tr>
              {tableHeaders.map((header) => (
                <th
                  key={header}
                  style={{
                    padding: "0.75rem",
                    fontSize: "0.75rem",
                    textAlign: "left",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => (
              <tr key={`row-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${index}-${cellIndex}`}
                    style={{
                      padding: "0.75rem",
                      fontSize: "0.875rem",
                      borderBottom:
                        index === tableRows.length - 1
                          ? "none"
                          : `1px solid ${colors.border}`,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartShell>
  );
}

export function BarChartComponent({
  props,
}: {
  props: {
    resultId?: string | null;
    title?: string | null;
    data?: { label: string; value: number }[];
  };
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);
  const tooltipStyles = getTooltipStyles(colors, darkMode);
  const { rows, loading, error } = useResultData(
    props.data && props.data.length > 0 ? null : props.resultId
  );
  if (loading) return <MessageState title={props.title} message="Loading chart..." />;
  if (error) return <MessageState title={props.title} message={error} error />;

  const source = rows ?? ((props.data ?? []) as Array<Record<string, unknown>>);
  const chartData = normalizeRowsForJsonRenderChart(source);
  if (chartData.length === 0) {
    return <MessageState title={props.title} message="No numeric data available for this chart." />;
  }

  return (
    <ChartShell title={props.title}>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={chartData}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} />
            <YAxis tick={{ fontSize: 12, fill: colors.muted }} />
            <Tooltip
              formatter={(value, name) => [formatTooltipValue(value), String(name)]}
              contentStyle={tooltipStyles.contentStyle}
              itemStyle={tooltipStyles.itemStyle}
              labelStyle={tooltipStyles.labelStyle}
              cursor={tooltipStyles.cursor}
            />
            <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function LineChartComponent({
  props,
}: {
  props: {
    resultId?: string | null;
    title?: string | null;
    data?: { label: string; value: number }[];
  };
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);
  const tooltipStyles = getTooltipStyles(colors, darkMode);
  const { rows, loading, error } = useResultData(
    props.data && props.data.length > 0 ? null : props.resultId
  );
  if (loading) return <MessageState title={props.title} message="Loading chart..." />;
  if (error) return <MessageState title={props.title} message={error} error />;

  const source = rows ?? ((props.data ?? []) as Array<Record<string, unknown>>);
  const chartData = normalizeRowsForJsonRenderChart(source);
  if (chartData.length === 0) {
    return <MessageState title={props.title} message="No numeric data available for this chart." />;
  }

  return (
    <ChartShell title={props.title}>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart data={chartData}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} />
            <YAxis tick={{ fontSize: 12, fill: colors.muted }} />
            <Tooltip
              formatter={(value, name) => [formatTooltipValue(value), String(name)]}
              contentStyle={tooltipStyles.contentStyle}
              itemStyle={tooltipStyles.itemStyle}
              labelStyle={tooltipStyles.labelStyle}
              cursor={tooltipStyles.cursor}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[0] }}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function PieChartComponent({
  props,
}: {
  props: {
    resultId?: string | null;
    title?: string | null;
    data?: { label: string; value: number }[];
  };
}) {
  const { darkMode } = useThemeContext();
  const colors = getSurfaceColors(darkMode);
  const tooltipStyles = getTooltipStyles(colors, darkMode);
  const { rows, loading, error } = useResultData(
    props.data && props.data.length > 0 ? null : props.resultId
  );
  if (loading) return <MessageState title={props.title} message="Loading chart..." />;
  if (error) return <MessageState title={props.title} message={error} error />;

  const source = rows ?? ((props.data ?? []) as Array<Record<string, unknown>>);
  const chartData = normalizeRowsForJsonRenderChart(source);
  if (chartData.length === 0) {
    return <MessageState title={props.title} message="No numeric data available for this chart." />;
  }

  return (
    <ChartShell title={props.title}>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`${entry.label}-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatTooltipValue(value), String(name)]}
              contentStyle={tooltipStyles.contentStyle}
              itemStyle={tooltipStyles.itemStyle}
              labelStyle={tooltipStyles.labelStyle}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "center",
          marginTop: "0.75rem",
        }}
      >
        {chartData.map((entry, index) => (
          <div
            key={`legend-${entry.label}-${index}`}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem" }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
}
