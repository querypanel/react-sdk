import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";

/** Card chrome shared by the Dashboard Chart block and the Assistant chat preview. */
export function ChartBlockFrame({
  title,
  datasourceCount = 0,
  height,
  colors,
  children,
}: {
  title: string;
  datasourceCount?: number;
  height: number;
  colors: ThemeColors;
  children: ReactNode;
}) {
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
          minWidth: 0,
          padding: "0.75rem",
          boxSizing: "border-box",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
            color: colors.text,
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: "0.75rem", color: colors.muted }}>
            {datasourceCount > 0
              ? `${datasourceCount} datasource${datasourceCount > 1 ? "s" : ""}`
              : ""}
          </div>
        </div>
        <div
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
      </div>
    </div>
  );
}
