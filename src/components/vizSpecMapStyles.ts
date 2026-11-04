import type { ThemeColors } from "../types";

export function overlayStyle(colors: ThemeColors): React.CSSProperties {
  return {
    background: colors.background,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: "0.375rem",
    fontSize: "0.75rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  };
}

export function controlStyle(colors: ThemeColors): React.CSSProperties {
  return {
    ...overlayStyle(colors),
    width: 26,
    height: 26,
    padding: 0,
    cursor: "pointer",
    fontSize: "0.875rem",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
