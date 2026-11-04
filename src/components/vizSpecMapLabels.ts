import type { MapMarker } from "./vizSpecMapMarkers";

/** What one row of the map is called in user-facing text ("device" / "devices"). */
export interface MapItemNoun {
  singular: string;
  plural: string;
}

export const DEFAULT_ITEM_NOUN: MapItemNoun = { singular: "item", plural: "items" };

/** "1 device" / "3 devices". */
export function countLabel(count: number, noun: MapItemNoun): string {
  return `${count} ${count === 1 ? noun.singular : noun.plural}`;
}

export function markerTitle(marker: MapMarker): string {
  return marker.name ?? `${marker.lat.toFixed(3)}, ${marker.lng.toFixed(3)}`;
}

/** Tooltip title: resolved place name, else the first row's label, else coordinates. */
export function tooltipTitle(marker: MapMarker, data: Array<Record<string, unknown>>, labelField: string | null): string {
  if (marker.name) return marker.name;
  const first = labelField ? data[marker.rowIndexes[0] ?? -1]?.[labelField] : null;
  return first != null && String(first) !== "" ? String(first) : markerTitle(marker);
}

/**
 * One stable id per marker: its coordinates (survive a data refresh, unlike an array index). Markers that
 * share coordinates (two places resolving to the same point) get a `#n` suffix so ids stay unique.
 */
export function markerIds(markers: Array<Pick<MapMarker, "lat" | "lng">>): string[] {
  const seen = new Map<string, number>();
  return markers.map(({ lat, lng }) => {
    const base = `${lat},${lng}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** `id` if a marker with that id still exists, else null (a selection must not outlive its marker). */
export function keepIfPresent(ids: readonly string[], id: string | null): string | null {
  return id !== null && ids.includes(id) ? id : null;
}
