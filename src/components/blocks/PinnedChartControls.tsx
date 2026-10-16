"use client";

import { useMemo, useState } from "react";
import type {
  ChartType,
  SqlModifications,
  ThemeColors,
  VizModifications,
} from "../../types";
import { compatibleChartTypes } from "./compatibleChartTypes";

export type DateRangePreset =
  | "last_7"
  | "last_30"
  | "last_90"
  | "this_month"
  | "ytd"
  | "custom";

export type PinnedChartControlsApply = {
  sqlModifications?: SqlModifications;
  vizModifications?: VizModifications;
};

export interface PinnedChartControlsProps {
  fields: string[];
  rows?: Array<Record<string, unknown>>;
  disabled?: boolean;
  canUndo?: boolean;
  colors: ThemeColors;
  currentChartType?: ChartType | "";
  onApply: (options: PinnedChartControlsApply) => void;
  onUndo?: () => void;
  className?: string;
}

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: "Last 7 days", value: "last_7" },
  { label: "Last 30 days", value: "last_30" },
  { label: "Last 90 days", value: "last_90" },
  { label: "This month", value: "this_month" },
  { label: "YTD", value: "ytd" },
  { label: "Custom", value: "custom" },
];

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  column: "Column",
  bar: "Bar",
  line: "Line",
  area: "Area",
  scatter: "Scatter",
  pie: "Pie",
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDateRangePreset(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): { from?: string; to?: string } | null {
  if (preset === "custom") {
    if (!customFrom && !customTo) return null;
    return { from: customFrom || undefined, to: customTo || undefined };
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);

  switch (preset) {
    case "last_7":
      start.setDate(end.getDate() - 6);
      break;
    case "last_30":
      start.setDate(end.getDate() - 29);
      break;
    case "last_90":
      start.setDate(end.getDate() - 89);
      break;
    case "this_month":
      start.setDate(1);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
    default: {
      const _exhaustive: never = preset;
      void _exhaustive;
      return null;
    }
  }

  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function PinnedChartControls({
  fields,
  rows = [],
  disabled = false,
  canUndo = false,
  colors,
  currentChartType = "",
  onApply,
  onUndo,
  className = "",
}: PinnedChartControlsProps) {
  const [open, setOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType | "">(currentChartType);
  const [preset, setPreset] = useState<DateRangePreset | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allowedTypes = useMemo(
    () => compatibleChartTypes(fields, rows),
    [fields, rows]
  );

  const handleApply = () => {
    const vizModifications: VizModifications = {};
    const sqlModifications: SqlModifications = {};

    if (chartType) vizModifications.chartType = chartType;

    if (preset) {
      const range = resolveDateRangePreset(
        preset,
        dateFrom || undefined,
        dateTo || undefined
      );
      if (range && (range.from || range.to)) {
        sqlModifications.dateRange = range;
      }
    }

    onApply({
      vizModifications:
        Object.keys(vizModifications).length > 0 ? vizModifications : undefined,
      sqlModifications:
        Object.keys(sqlModifications).length > 0 ? sqlModifications : undefined,
    });
  };

  const styles = {
    wrap: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.5rem",
      marginBottom: "0.5rem",
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "0.375rem",
    },
    button: {
      height: "1.75rem",
      padding: "0 0.625rem",
      fontSize: "0.75rem",
      borderRadius: "0.375rem",
      border: `1px solid ${colors.border}`,
      background: colors.background,
      color: colors.text,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    },
    primary: {
      background: colors.primary,
      color: "#fff",
      border: `1px solid ${colors.primary}`,
    },
    panel: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: "0.5rem",
      padding: "0.5rem",
      borderRadius: "0.5rem",
      border: `1px solid ${colors.border}`,
      background: colors.background,
    },
    field: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
    },
    label: {
      fontSize: "0.625rem",
      letterSpacing: "0.04em",
      textTransform: "uppercase" as const,
      color: colors.muted,
    },
    control: {
      width: "100%",
      borderRadius: "0.375rem",
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.text,
      fontSize: "0.75rem",
      padding: "0.375rem 0.5rem",
    },
  };

  return (
    <div className={className} style={styles.wrap}>
      <div style={styles.toolbar}>
        {canUndo && onUndo ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onUndo}
            style={styles.button}
          >
            Undo
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          style={styles.button}
          aria-expanded={open}
        >
          {open ? "Hide controls" : "Chart controls"}
        </button>
      </div>

      {open ? (
        <div style={styles.panel}>
          <div style={styles.field}>
            <span style={styles.label}>Date range</span>
            <select
              value={preset}
              disabled={disabled}
              onChange={(e) =>
                setPreset(e.target.value as DateRangePreset | "")
              }
              style={styles.control}
            >
              <option value="">No change</option>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {preset === "custom" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem" }}>
                <input
                  type="date"
                  value={dateFrom}
                  disabled={disabled}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={styles.control}
                />
                <input
                  type="date"
                  value={dateTo}
                  disabled={disabled}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={styles.control}
                />
              </div>
            ) : null}
          </div>

          <div style={styles.field}>
            <span style={styles.label}>Chart type</span>
            <select
              value={chartType}
              disabled={disabled}
              onChange={(e) => setChartType(e.target.value as ChartType | "")}
              style={styles.control}
            >
              <option value="">No change</option>
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {CHART_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.field, justifyContent: "flex-end" }}>
            <span style={styles.label}>&nbsp;</span>
            <button
              type="button"
              disabled={disabled || (!chartType && !preset)}
              onClick={handleApply}
              style={{ ...styles.button, ...styles.primary }}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
