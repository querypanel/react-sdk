import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";

/** Card chrome shared by the Dashboard Chart block and the Assistant chat preview. */
export function ChartBlockFrame({
  title,
  datasourceCount = 0,
  titleActions,
  error,
  overlay,
  height,
  colors,
  children,
}: {
  title: string;
  datasourceCount?: number;
  /** Replaces the datasource count in the title row (e.g. pinned chart controls). */
  titleActions?: ReactNode;
  error?: ReactNode;
  /** Rendered over the chart area (e.g. pinned chart control popovers). */
  overlay?: ReactNode;
  height: number;
  colors: ThemeColors;
  children: ReactNode;
}) {
  return (
    <div
      data-qp-frame="outer"
      style={{
        width: "100%",
        minWidth: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0.25rem 0",
      }}
    >
      <div
        data-qp-frame="card"
        style={{
          width: "100%",
          maxWidth: "56rem",
          minWidth: 0,
          padding: "0.75rem",
          boxSizing: "border-box",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: "0.75rem",
        }}
      >
        <div
          data-qp-frame="header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
            color: colors.text,
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</div>
          {titleActions ?? (
            <div style={{ fontSize: "0.75rem", color: colors.muted }}>
              {datasourceCount > 0
                ? `${datasourceCount} datasource${datasourceCount > 1 ? "s" : ""}`
                : ""}
            </div>
          )}
        </div>
        {error ? (
          <div style={{ marginBottom: "0.5rem", fontSize: "0.75rem", color: colors.error }}>
            {error}
          </div>
        ) : null}
        <div style={{ position: "relative" }}>
        <div
          data-qp-frame="plot"
          style={{
            width: "100%",
            minWidth: 0,
            height: `${height}px`,
            borderRadius: "0.5rem",
            background: colors.background,
            border: `1px solid ${colors.border}`,
            padding: "0.5rem",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {children}
        </div>
        {overlay}
        </div>
      </div>
    </div>
  );
}
