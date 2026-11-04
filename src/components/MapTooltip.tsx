import { useMemo } from "react";
import type { ThemeColors } from "../types";
import { MapSwatch } from "./MapSwatch";
import { countLabel, tooltipTitle, type MapItemNoun } from "./vizSpecMapLabels";
import type { MapMarker } from "./vizSpecMapMarkers";
import { overlayStyle } from "./vizSpecMapStyles";

interface Props {
  marker: MapMarker;
  /** Screen position of the marker and its drawn radius. */
  x: number;
  y: number;
  r: number;
  data: Array<Record<string, unknown>>;
  labelField: string | null;
  showCategories: boolean;
  categoryColors: Map<string, string>;
  colors: ThemeColors;
  noun: MapItemNoun;
}

export function MapTooltip({ marker, x, y, r, data, labelField, showCategories, categoryColors, colors, noun }: Props) {
  const overlay = useMemo(() => overlayStyle(colors), [colors]);
  return (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        left: x,
        top: y - r - 8,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        zIndex: 2,
        ...overlay,
        padding: "0.375rem 0.5rem",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ fontWeight: 600 }}>{tooltipTitle(marker, data, labelField)}</div>
      <div>{countLabel(marker.total, noun)}</div>
      {showCategories &&
        marker.counts.map(({ category, count }) => (
          <div key={category} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <MapSwatch color={categoryColors.get(category)} />
            {category}: {count}
          </div>
        ))}
    </div>
  );
}
