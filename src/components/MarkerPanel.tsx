import { useMemo } from "react";
import type { ThemeColors } from "../types";
import { MapSwatch } from "./MapSwatch";
import type { MapItemNoun } from "./vizSpecMapLabels";
import { tooltipTitle } from "./vizSpecMapLabels";
import { categoryOf, type MapMarker } from "./vizSpecMapMarkers";
import { overlayStyle } from "./vizSpecMapStyles";

const PANEL_WIDTH = 240;

interface Props {
  marker: MapMarker;
  data: Array<Record<string, unknown>>;
  labelField: string | null;
  colorField: string | null;
  tooltips: string[] | null;
  categoryColors: Map<string, string>;
  colors: ThemeColors;
  noun: MapItemNoun;
  onClose: () => void;
}

/** Click list: every row behind the selected marker. */
export function MarkerPanel({ marker, data, labelField, colorField, tooltips, categoryColors, colors, noun, onClose }: Props) {
  const overlay = useMemo(() => overlayStyle(colors), [colors]);
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        bottom: 8,
        width: PANEL_WIDTH,
        maxWidth: "calc(100% - 16px)",
        display: "flex",
        flexDirection: "column",
        zIndex: 3,
        ...overlay,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", padding: "0.5rem 0.625rem", borderBottom: `1px solid ${colors.border}` }}>
        <strong>
          {tooltipTitle(marker, data, labelField)} ({marker.total})
        </strong>
        <button type="button" aria-label={`Close ${noun.singular} list`} onClick={onClose} style={{ all: "unset", cursor: "pointer", color: colors.muted }}>
          ×
        </button>
      </div>
      <ul style={{ margin: 0, padding: "0.375rem 0.625rem", listStyle: "none", overflowY: "auto", flex: 1 }}>
        {marker.rowIndexes.map((rowIndex) => {
          const row = data[rowIndex] ?? {};
          const label = labelField && row[labelField] != null && String(row[labelField]) !== "" ? String(row[labelField]) : `Row ${rowIndex + 1}`;
          const extras = (tooltips ?? []).filter((f) => row[f] != null && row[f] !== "");
          return (
            <li key={rowIndex} style={{ padding: "0.25rem 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                {colorField && <MapSwatch color={categoryColors.get(categoryOf(row[colorField]))} />}
                {label}
              </div>
              {extras.map((f) => (
                <div key={f} style={{ color: colors.muted, paddingLeft: colorField ? "1rem" : 0 }}>
                  {f}: {String(row[f])}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
