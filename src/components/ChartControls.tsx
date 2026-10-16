"use client";

import { useState } from "react";
import type {
  ChartType,
  TimeUnit,
  ColorPreset,
  SqlModifications,
  VizModifications,
  ThemeColors,
} from "../types";
import {
  DATE_RANGE_PRESETS,
  resolveDateRangePreset,
  type DateRangePreset,
} from "./dateRangePresets";

export interface ChartControlsProps {
  /** Available field names from the query result */
  fields: string[];
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Callback when changes are applied */
  onApply: (options: {
    sqlModifications?: SqlModifications;
    vizModifications?: VizModifications;
    colorPreset?: ColorPreset;
  }) => void;
  /** Theme colors */
  colors?: Partial<ThemeColors>;
  /** Additional class name */
  className?: string;
  /** Show color preset selector (default true for default variant, false for pinned) */
  showColorPresets?: boolean;
  /**
   * `default` — full demo/QueryResult controls (axes, time grain, raw dates, colors).
   * `pinned` — collapsible date-preset + chart-type controls with optional undo.
   */
  variant?: "default" | "pinned";
  /** Show X/Y axis selectors (default true unless variant is pinned) */
  showAxes?: boolean;
  /** Show time-granularity selector (default true unless variant is pinned) */
  showTimeGrain?: boolean;
  /** Use date-range presets instead of raw from/to (default true when variant is pinned) */
  datePresets?: boolean;
  /** Start collapsed with a toggle (default true when variant is pinned) */
  collapsible?: boolean;
  /** Current chart type for the pinned selector initial value */
  currentChartType?: ChartType | "";
  /** Whether undo is available */
  canUndo?: boolean;
  /** Undo last pinned modify */
  onUndo?: () => void;
}

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: "Column (Vertical)", value: "column" },
  { label: "Bar (Horizontal)", value: "bar" },
  { label: "Line", value: "line" },
  { label: "Area", value: "area" },
  { label: "Scatter", value: "scatter" },
  { label: "Pie", value: "pie" },
];

const PINNED_CHART_TYPE_LABELS: Record<ChartType, string> = {
  column: "Column",
  bar: "Bar",
  line: "Line",
  area: "Area",
  scatter: "Scatter",
  pie: "Pie",
};

const TIME_GRAIN: { label: string; value: TimeUnit }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

const COLOR_PRESETS: { label: string; value: ColorPreset }[] = [
  { label: "Default", value: "default" },
  { label: "Sunset", value: "sunset" },
  { label: "Emerald", value: "emerald" },
  { label: "Ocean", value: "ocean" },
];

const defaultColors: Partial<ThemeColors> = {
  primary: "#8B5CF6",
  text: "#F1F5F9",
  muted: "#94A3B8",
  border: "rgba(139,92,246,0.3)",
  surface: "rgba(0,0,0,0.4)",
  background: "#0a0612",
};

export function ChartControls({
  fields,
  disabled = false,
  onApply,
  colors = defaultColors,
  className = "",
  showColorPresets,
  variant = "default",
  showAxes,
  showTimeGrain,
  datePresets,
  collapsible,
  currentChartType = "",
  canUndo = false,
  onUndo,
}: ChartControlsProps) {
  const isPinned = variant === "pinned";
  const resolvedShowAxes = showAxes ?? !isPinned;
  const resolvedShowTimeGrain = showTimeGrain ?? !isPinned;
  const resolvedDatePresets = datePresets ?? isPinned;
  const resolvedCollapsible = collapsible ?? isPinned;
  const resolvedShowColorPresets = showColorPresets ?? !isPinned;

  const [open, setOpen] = useState(!resolvedCollapsible);
  const [chartType, setChartType] = useState<ChartType | "">(currentChartType);
  const [xField, setXField] = useState<string>("");
  const [yField, setYField] = useState<string>("");
  const [timeGranularity, setTimeGranularity] = useState<TimeUnit | "">("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [preset, setPreset] = useState<DateRangePreset | "">("");
  const [colorPreset, setColorPreset] = useState<ColorPreset>("default");

  const mergedColors = { ...defaultColors, ...colors };

  const handleApply = () => {
    const vizModifications: VizModifications = {};
    const sqlModifications: SqlModifications = {};

    if (chartType) vizModifications.chartType = chartType;
    if (resolvedShowAxes) {
      if (xField) vizModifications.xAxis = { field: xField };
      if (yField) vizModifications.yAxis = { field: yField };
    }
    if (resolvedShowTimeGrain && timeGranularity) {
      sqlModifications.timeGranularity = timeGranularity;
    }

    if (resolvedDatePresets) {
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
    } else if (dateFrom || dateTo) {
      sqlModifications.dateRange = {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      };
    }

    onApply({
      vizModifications:
        Object.keys(vizModifications).length > 0 ? vizModifications : undefined,
      sqlModifications:
        Object.keys(sqlModifications).length > 0 ? sqlModifications : undefined,
      ...(resolvedShowColorPresets ? { colorPreset } : {}),
    });
  };

  const handleReset = () => {
    setChartType("");
    setXField("");
    setYField("");
    setTimeGranularity("");
    setDateFrom("");
    setDateTo("");
    setPreset("");
    setColorPreset("default");
    onApply({ colorPreset: "default" });
  };

  const pinnedApplyDisabled =
    isPinned && !chartType && !preset;

  const styles = {
    container: {
      marginBottom: isPinned ? "0.5rem" : "1.5rem",
      borderRadius: isPinned ? "0.5rem" : "0.75rem",
      border: isPinned ? "none" : `1px solid ${mergedColors.border}`,
      backgroundColor: isPinned ? "transparent" : mergedColors.surface,
      padding: isPinned ? 0 : "0.75rem 1rem",
      display: "flex",
      flexDirection: "column" as const,
      gap: isPinned ? "0.5rem" : 0,
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "0.375rem",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      marginBottom: "0.75rem",
    },
    title: {
      fontSize: "0.875rem",
      fontWeight: 500,
      color: mergedColors.text,
    },
    buttonGroup: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
    },
    button: {
      height: "1.75rem",
      padding: isPinned ? "0 0.625rem" : "0 0.75rem",
      fontSize: "0.75rem",
      borderRadius: "0.375rem",
      border: isPinned ? `1px solid ${mergedColors.border}` : "none",
      background: isPinned ? mergedColors.background : undefined,
      color: isPinned ? mergedColors.text : undefined,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "all 0.15s",
    },
    resetButton: {
      backgroundColor: "transparent",
      color: mergedColors.muted,
    },
    applyButton: {
      background: isPinned
        ? mergedColors.primary
        : `linear-gradient(to right, ${mergedColors.primary}, #3B82F6)`,
      color: "white",
      border: isPinned ? `1px solid ${mergedColors.primary}` : "none",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: "0.75rem",
    },
    pinnedPanel: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: "0.5rem",
      padding: "0.5rem",
      borderRadius: "0.5rem",
      border: `1px solid ${mergedColors.border}`,
      background: mergedColors.background,
    },
    fieldGroup: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
    },
    label: {
      fontSize: isPinned ? "0.625rem" : "0.6875rem",
      textTransform: "uppercase" as const,
      letterSpacing: isPinned ? "0.04em" : "0.05em",
      color: mergedColors.muted,
    },
    select: {
      width: "100%",
      borderRadius: isPinned ? "0.375rem" : "0.5rem",
      backgroundColor: isPinned ? mergedColors.surface : mergedColors.background,
      border: `1px solid ${mergedColors.border}`,
      fontSize: "0.75rem",
      color: mergedColors.text,
      padding: "0.375rem 0.5rem",
      outline: "none",
    },
    input: {
      width: "100%",
      borderRadius: isPinned ? "0.375rem" : "0.5rem",
      backgroundColor: isPinned ? mergedColors.surface : mergedColors.background,
      border: `1px solid ${mergedColors.border}`,
      fontSize: isPinned ? "0.75rem" : "0.625rem",
      color: mergedColors.text,
      padding: "0.375rem 0.5rem",
      outline: "none",
    },
    dateRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "0.375rem",
    },
  };

  const chartTypeSelect = (
    <div style={styles.fieldGroup}>
      <span style={styles.label}>{isPinned ? "Chart type" : "Chart"}</span>
      <select
        value={chartType}
        onChange={(e) => setChartType(e.target.value as ChartType | "")}
        disabled={disabled}
        style={styles.select}
      >
        <option value="">{isPinned ? "No change" : "Auto"}</option>
        {CHART_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {isPinned ? PINNED_CHART_TYPE_LABELS[t.value] : t.label}
          </option>
        ))}
      </select>
    </div>
  );

  const dateControls = resolvedDatePresets ? (
    <div style={styles.fieldGroup}>
      <span style={styles.label}>Date range</span>
      <select
        value={preset}
        disabled={disabled}
        onChange={(e) => setPreset(e.target.value as DateRangePreset | "")}
        style={styles.select}
      >
        <option value="">No change</option>
        {DATE_RANGE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === "custom" ? (
        <div style={styles.dateRow}>
          <input
            type="date"
            value={dateFrom}
            disabled={disabled}
            onChange={(e) => setDateFrom(e.target.value)}
            style={styles.input}
          />
          <input
            type="date"
            value={dateTo}
            disabled={disabled}
            onChange={(e) => setDateTo(e.target.value)}
            style={styles.input}
          />
        </div>
      ) : null}
    </div>
  ) : (
    <div style={styles.fieldGroup}>
      <span style={styles.label}>Time</span>
      {resolvedShowTimeGrain ? (
        <select
          value={timeGranularity}
          onChange={(e) => setTimeGranularity(e.target.value as TimeUnit | "")}
          disabled={disabled}
          style={styles.select}
        >
          <option value="">Auto</option>
          {TIME_GRAIN.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      ) : null}
      <div style={styles.dateRow}>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          disabled={disabled}
          style={styles.input}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          disabled={disabled}
          style={styles.input}
        />
      </div>
    </div>
  );

  if (isPinned) {
    return (
      <div className={className} style={styles.container}>
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
          {resolvedCollapsible ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen((v) => !v)}
              style={styles.button}
              aria-expanded={open}
            >
              {open ? "Hide controls" : "Chart controls"}
            </button>
          ) : null}
        </div>

        {open || !resolvedCollapsible ? (
          <div style={styles.pinnedPanel}>
            {dateControls}
            {chartTypeSelect}
            <div style={{ ...styles.fieldGroup, justifyContent: "flex-end" }}>
              <span style={styles.label}>&nbsp;</span>
              <button
                type="button"
                disabled={disabled || pinnedApplyDisabled}
                onClick={handleApply}
                style={{ ...styles.button, ...styles.applyButton }}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className} style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Chart Controls</span>
        <div style={styles.buttonGroup}>
          <button
            type="button"
            disabled={disabled}
            onClick={handleReset}
            style={{ ...styles.button, ...styles.resetButton }}
          >
            Reset
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleApply}
            style={{ ...styles.button, ...styles.applyButton }}
          >
            Apply
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {chartTypeSelect}

        {resolvedShowAxes ? (
          <>
            <div style={styles.fieldGroup}>
              <span style={styles.label}>X Axis</span>
              <select
                value={xField}
                onChange={(e) => setXField(e.target.value)}
                disabled={disabled}
                style={styles.select}
              >
                <option value="">Auto</option>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.fieldGroup}>
              <span style={styles.label}>Y Axis</span>
              <select
                value={yField}
                onChange={(e) => setYField(e.target.value)}
                disabled={disabled}
                style={styles.select}
              >
                <option value="">Auto</option>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {dateControls}

        {resolvedShowColorPresets && (
          <div style={styles.fieldGroup}>
            <span style={styles.label}>Colors</span>
            <select
              value={colorPreset}
              onChange={(e) => setColorPreset(e.target.value as ColorPreset)}
              disabled={disabled}
              style={styles.select}
            >
              {COLOR_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
