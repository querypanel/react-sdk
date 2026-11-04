"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ChartType, ThemeColors } from "../../types";
import {
  DATE_RANGE_PRESETS,
  resolveDateRangePreset,
  type DateRangePreset,
} from "../dateRangePresets";
import type { PinnedChartApplyOptions } from "./usePinnedChartBlockModify";

const CHART_TYPE_OPTIONS: { label: string; value: ChartType }[] = [
  { label: "Column", value: "column" },
  { label: "Bar", value: "bar" },
  { label: "Line", value: "line" },
  { label: "Area", value: "area" },
  { label: "Scatter", value: "scatter" },
  { label: "Pie", value: "pie" },
];

function ChartTypeGlyph({ type }: { type: ChartType }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (type) {
    case "column":
      return (
        <svg {...common}>
          <path d="M6 20V10M12 20V4M18 20v-7" />
        </svg>
      );
    case "bar":
      return (
        <svg {...common}>
          <path d="M4 6h10M4 12h16M4 18h7" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <path d="M4 16l5-5 4 3 7-8" />
        </svg>
      );
    case "area":
      return (
        <svg {...common}>
          <path d="M4 18l5-7 4 3 7-8v12H4z" fill="currentColor" opacity="0.2" />
          <path d="M4 16l5-5 4 3 7-8" />
        </svg>
      );
    case "scatter":
      return (
        <svg {...common}>
          <circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="13" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pie":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 1-9 9h9V3z" />
          <path d="M12 3a9 9 0 0 1 9 9h-9V3z" fill="currentColor" opacity="0.25" />
        </svg>
      );
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

type PinnedChartSettingsPanelProps = {
  colors: ThemeColors;
  disabled: boolean;
  /** Chart type currently rendered (marked with a dashed outline). */
  currentChartType: ChartType | "";
  /** Chart types the block can render; defaults to all. An empty list hides the picker (map kind). */
  chartTypes?: ChartType[];
  onApply: (options: PinnedChartApplyOptions) => void;
  onClose: () => void;
};

/**
 * Overlay panel for a pinned chart: date-range chips + chart-type grid.
 * Dismisses on outside click or Escape (the cog carries `data-pinned-chart-controls-trigger`).
 */
export function PinnedChartSettingsPanel({
  colors,
  disabled,
  currentChartType,
  chartTypes,
  onApply,
  onClose,
}: PinnedChartSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<DateRangePreset | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chartType, setChartType] = useState<ChartType | "">("");

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-pinned-chart-controls-trigger="true"]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const chartTypeChanged = Boolean(chartType) && chartType !== currentChartType;
  const applyDisabled = disabled || (!chartTypeChanged && !preset);

  const handleApply = () => {
    const range = preset
      ? resolveDateRangePreset(preset, dateFrom || undefined, dateTo || undefined)
      : null;
    onApply({
      ...(chartTypeChanged && chartType
        ? { vizModifications: { chartType } }
        : {}),
      ...(range && (range.from || range.to)
        ? { sqlModifications: { dateRange: range } }
        : {}),
    });
  };

  const label: CSSProperties = {
    fontSize: "0.625rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: colors.muted,
  };
  const section: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  };
  const chip = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? colors.primary : colors.border}`,
    background: active ? colors.primary : colors.surface,
    color: active ? "#fff" : colors.text,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontWeight: 600,
    transition: "border-color 0.15s, background 0.15s, color 0.15s",
  });
  const dateInput: CSSProperties = {
    width: "100%",
    borderRadius: "0.375rem",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    fontSize: "0.75rem",
    color: colors.text,
    padding: "0.375rem 0.5rem",
    outline: "none",
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chart settings"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
        padding: "0.75rem",
        borderRadius: "0.875rem",
        border: `1px solid ${colors.border}`,
        background: colors.background,
        position: "absolute",
        top: "0.35rem",
        right: "0.35rem",
        width: "min(18.5rem, calc(100% - 0.7rem))",
        zIndex: 20,
        boxShadow:
          "0 12px 40px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08)",
        backdropFilter: "blur(10px)",
        animation: "qp-pinned-controls-in 140ms ease-out",
      }}
    >
      <style>{`
        @keyframes qp-pinned-controls-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: colors.text,
              letterSpacing: "-0.01em",
            }}
          >
            Tweak chart
          </div>
          <div
            style={{ fontSize: "0.6875rem", color: colors.muted, marginTop: "0.1rem" }}
          >
            Range and shape — no chat needed
          </div>
        </div>
        <button
          type="button"
          aria-label="Close chart settings"
          onClick={onClose}
          style={{
            width: "1.75rem",
            height: "1.75rem",
            borderRadius: "999px",
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: colors.muted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div style={section}>
        <span style={label}>Date range</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {DATE_RANGE_PRESETS.map((p) => {
            const active = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                title={p.label}
                onClick={() => setPreset(active ? "" : p.value)}
                style={{
                  ...chip(active),
                  height: "1.75rem",
                  padding: "0 0.6rem",
                  borderRadius: "999px",
                  fontSize: "0.6875rem",
                }}
              >
                {p.chip}
              </button>
            );
          })}
        </div>
        {preset === "custom" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.375rem",
            }}
          >
            <input
              type="date"
              value={dateFrom}
              disabled={disabled}
              onChange={(e) => setDateFrom(e.target.value)}
              style={dateInput}
            />
            <input
              type="date"
              value={dateTo}
              disabled={disabled}
              onChange={(e) => setDateTo(e.target.value)}
              style={dateInput}
            />
          </div>
        ) : null}
      </div>

      {chartTypes?.length === 0 ? null : (
      <div style={section}>
        <span style={label}>
          Chart type
          {currentChartType
            ? ` · ${CHART_TYPE_OPTIONS.find((t) => t.value === currentChartType)?.label ?? ""}`
            : ""}
        </span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.35rem",
          }}
        >
          {CHART_TYPE_OPTIONS.filter(
            (t) => !chartTypes || chartTypes.includes(t.value)
          ).map((t) => {
            const active = chartType === t.value;
            const isCurrent = currentChartType === t.value && !chartType;
            return (
              <button
                key={t.value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                title={t.label}
                onClick={() => setChartType(active ? "" : t.value)}
                style={{
                  ...chip(active),
                  ...(isCurrent && !active
                    ? { border: `1px dashed ${colors.primary}` }
                    : {}),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.2rem",
                  minHeight: "3.1rem",
                  padding: "0.4rem 0.25rem",
                  borderRadius: "0.65rem",
                  fontSize: "0.625rem",
                  letterSpacing: "0.02em",
                }}
              >
                <ChartTypeGlyph type={t.value} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      <button
        type="button"
        disabled={applyDisabled}
        onClick={handleApply}
        style={{
          width: "100%",
          height: "2.15rem",
          borderRadius: "0.65rem",
          border: `1px solid ${colors.primary}`,
          background: colors.primary,
          color: "#fff",
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.01em",
          cursor: applyDisabled ? "not-allowed" : "pointer",
          opacity: applyDisabled ? 0.45 : 1,
        }}
      >
        Apply changes
      </button>
    </div>
  );
}
