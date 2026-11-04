import { useState } from "react";
import type { ThemeColors } from "../types";
import { MapSwatch } from "./MapSwatch";
import { countLabel, type MapItemNoun } from "./vizSpecMapLabels";
import { describeRow } from "./vizSpecMapPlaces";

export function MapLegend({ categories, categoryColors, colors }: { categories: string[]; categoryColors: Map<string, string>; colors: ThemeColors }) {
  return (
    <ul
      aria-label="Legend"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.875rem", margin: 0, padding: "0.375rem 0.25rem 0", listStyle: "none", fontSize: "0.75rem", color: colors.text }}
    >
      {categories.map((category) => (
        <li key={category} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <MapSwatch color={categoryColors.get(category)} />
          {category}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  colors: ThemeColors;
  noun: MapItemNoun;
  data: Array<Record<string, unknown>>;
  /** Fields used to describe an unplaced row. */
  describeFields: Parameters<typeof describeRow>[1];
  resolveError: string | null;
  locating: boolean;
  unplacedRows: number[];
}

/** Place-mode footer: resolution status, the unplaced rows (expandable) and the GeoNames attribution. */
export function PlacesFooter({ colors, noun, data, describeFields, resolveError, locating, unplacedRows }: Props) {
  const [showUnplaced, setShowUnplaced] = useState(false);
  return (
    <div style={{ fontSize: "0.75rem", color: colors.muted, padding: "0.375rem 0.25rem 0" }}>
      {resolveError ? (
        <div>Couldn&apos;t resolve places: {resolveError}</div>
      ) : locating ? (
        <div>Locating places…</div>
      ) : unplacedRows.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowUnplaced((v) => !v)}
            aria-expanded={showUnplaced}
            style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}
          >
            {countLabel(unplacedRows.length, noun)} couldn&apos;t be placed
          </button>
          {showUnplaced && (
            <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
              {unplacedRows.map((rowIndex) => (
                <li key={rowIndex}>{describeRow(data[rowIndex] ?? {}, describeFields) || `Row ${rowIndex + 1}`}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <div>
        Place data:{" "}
        <a href="https://www.geonames.org" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
          GeoNames
        </a>{" "}
        (CC BY 4.0)
      </div>
    </div>
  );
}
