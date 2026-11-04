"use client";

import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { MessageSquareIcon } from "lucide-react";
import type { ChartType, ThemeColors } from "../../types";
import {
  DATE_RANGE_SHORTCUTS,
  activeDateShortcut,
  resolveDateRangePreset,
  type DateRangePreset,
} from "../dateRangePresets";
import { PinnedChartSettingsPanel } from "./PinnedChartSettingsPanel";
import type { usePinnedChartBlockModify } from "./usePinnedChartBlockModify";

/** "Ask about this" shortcut: sits in the title row with the other chart controls. */
function AskAboutThisButton({
  style,
  onAsk,
}: {
  style: CSSProperties;
  onAsk: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label="Ask about this chart"
      title="Ask about this chart"
      data-qp-ask-about
      style={{
        ...style,
        width: "1.75rem",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: 1,
      }}
    >
      <MessageSquareIcon size={14} aria-hidden="true" />
    </button>
  );
}

type PinnedTitleActionsProps = {
  colors: ThemeColors;
  disabled: boolean;
  canUndo: boolean;
  controlsOpen: boolean;
  activeShortcut: DateRangePreset | "";
  onToggleControls: () => void;
  onUndo: () => void;
  onDateShortcut: (preset: DateRangePreset) => void;
  onAsk?: () => void;
};

/** Undo + date shortcuts + cog on the right of a pinned chart's title row. */
function PinnedTitleActions({
  colors,
  disabled,
  canUndo,
  controlsOpen,
  activeShortcut,
  onToggleControls,
  onUndo,
  onDateShortcut,
  onAsk,
}: PinnedTitleActionsProps) {
  const buttonStyle = {
    height: "1.75rem",
    padding: "0 0.625rem",
    fontSize: "0.75rem",
    borderRadius: "0.375rem",
    border: `1px solid ${colors.border}`,
    background: colors.background,
    color: colors.text,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      {onAsk ? <AskAboutThisButton style={buttonStyle} onAsk={onAsk} /> : null}
      {canUndo ? (
        <button type="button" disabled={disabled} onClick={onUndo} style={buttonStyle}>
          Undo
        </button>
      ) : null}
      {DATE_RANGE_SHORTCUTS.map((shortcut) => {
        const active = activeShortcut === shortcut.value;
        return (
          <button
            key={shortcut.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={shortcut.label}
            onClick={() => onDateShortcut(shortcut.value)}
            style={{
              ...buttonStyle,
              padding: "0 0.5rem",
              fontSize: "0.6875rem",
              fontWeight: 600,
              border: `1px solid ${active ? colors.primary : colors.border}`,
              background: active ? colors.primary : colors.background,
              color: active ? "#fff" : colors.text,
            }}
          >
            {shortcut.chip}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleControls}
        aria-label={controlsOpen ? "Close chart settings" : "Chart settings"}
        aria-expanded={controlsOpen}
        data-pinned-chart-controls-trigger="true"
        style={{
          ...buttonStyle,
          width: "1.75rem",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Shared chrome for pinned chart blocks: title-row actions (undo, 7d/30d, cog),
 * plus the settings panel and "applying" overlay to render over the chart.
 */
export function usePinnedChartChrome({
  modify,
  colors,
  disabled,
  sqlParams,
  currentChartType,
  chartTypes,
  mapCountry,
  onAsk,
}: {
  modify: ReturnType<typeof usePinnedChartBlockModify>;
  colors: ThemeColors;
  /** Extra disabled state (e.g. rows still loading). */
  disabled: boolean;
  sqlParams: Record<string, unknown>;
  currentChartType: ChartType | "";
  chartTypes?: ChartType[];
  /** Map blocks: country code shown read-only in settings. */
  mapCountry?: string;
  /** Adds an "Ask about this" shortcut to the title row (Workspace only). */
  onAsk?: () => void;
}): { titleActions: ReactNode; controls: ReactNode } {
  const { controlsEnabled, isModifying, canUndo, onApply, onUndo } = modify;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const isDisabled = isModifying || disabled;

  const apply: typeof onApply = async (options) => {
    const ok = await onApply(options);
    if (ok) close();
    return ok;
  };

  const titleActions = controlsEnabled ? (
    <PinnedTitleActions
      colors={colors}
      disabled={isDisabled}
      canUndo={canUndo}
      controlsOpen={open}
      activeShortcut={activeDateShortcut(sqlParams)}
      onToggleControls={() => setOpen((v) => !v)}
      onUndo={onUndo}
      onDateShortcut={(preset) => {
        const range = resolveDateRangePreset(preset);
        if (range) void apply({ sqlModifications: { dateRange: range } });
      }}
      onAsk={onAsk}
    />
  ) : onAsk ? (
    <AskAboutThisButton
      onAsk={onAsk}
      style={{
        height: "1.75rem",
        borderRadius: "0.375rem",
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.text,
      }}
    />
  ) : null;

  const controls = (
    <>
      {controlsEnabled && open ? (
        <PinnedChartSettingsPanel
          colors={colors}
          disabled={isDisabled}
          currentChartType={currentChartType}
          chartTypes={chartTypes}
          mapCountry={mapCountry}
          onApply={apply}
          onClose={close}
        />
      ) : null}
      {isModifying ? <PinnedModifyingOverlay colors={colors} /> : null}
    </>
  );

  return { titleActions, controls };
}

/** Full-area "Applying changes..." overlay for a pinned chart. */
function PinnedModifyingOverlay({ colors }: { colors: ThemeColors }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "0.5rem",
        backgroundColor: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
    >
      <div style={{ fontSize: "0.875rem", color: colors.text }}>Applying changes...</div>
    </div>
  );
}
