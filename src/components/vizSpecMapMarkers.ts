import type { MapRow } from "./vizSpecMapGeometry";
import { toCoordinate } from "./vizSpecMapGeometry";
import type { PlacedPoint } from "./vizSpecMapPlaces";

/** Category shown for null/empty color values. */
export const UNKNOWN_CATEGORY = "unknown";

// Status presets: category names that read as a status get a fixed traffic-light color (case-insensitive);
// any other category takes the next palette color. Not configurable per spec.
// Mid-tone fills that read on both the light and dark map backgrounds.
export const STATUS_COLORS = { green: "#22C55E", amber: "#F59E0B", red: "#EF4444", grey: "#94A3B8" } as const;

const PRESETS: Record<string, string> = {
  active: STATUS_COLORS.green,
  online: STATUS_COLORS.green,
  running: STATUS_COLORS.green,
  idle: STATUS_COLORS.amber,
  standby: STATUS_COLORS.amber,
  offline: STATUS_COLORS.red,
  error: STATUS_COLORS.red,
  fault: STATUS_COLORS.red,
  [UNKNOWN_CATEGORY]: STATUS_COLORS.grey,
};

/** Category text for a color-column cell; null/empty become "unknown". */
export function categoryOf(value: unknown): string {
  if (value === null || value === undefined) return UNKNOWN_CATEGORY;
  const text = String(value).trim();
  return text === "" ? UNKNOWN_CATEGORY : text;
}

/** Status preset color (case-insensitive), or null when the category is not a preset. */
export function presetColor(category: string): string | null {
  return PRESETS[category.trim().toLowerCase()] ?? null;
}

/** Color per category: presets first, other categories cycle through `palette` in order of appearance. */
export function assignCategoryColors(categories: string[], palette: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  let next = 0;
  for (const category of categories) {
    if (colors.has(category)) continue;
    const preset = presetColor(category);
    if (preset) colors.set(category, preset);
    else colors.set(category, palette[next++ % Math.max(palette.length, 1)] ?? STATUS_COLORS.grey);
  }
  return colors;
}

export interface MapMarker {
  lat: number;
  lng: number;
  /** Resolved place name; null for lat/lng maps. */
  name: string | null;
  total: number;
  /** Per-category counts in first-seen order (a single "" category when there is no color column). */
  counts: Array<{ category: string; count: number }>;
  /** Indexes into the source rows. */
  rowIndexes: number[];
}

/** Group lat/lng rows that share identical coordinates into points (rows without valid coordinates are skipped). */
export function groupLatLngRows(rows: MapRow[], latField: string | null, lngField: string | null): PlacedPoint[] {
  if (!latField || !lngField) return [];
  const points = new Map<string, PlacedPoint>();
  rows.forEach((row, rowIndex) => {
    const lat = toCoordinate(row[latField], 90);
    const lng = toCoordinate(row[lngField], 180);
    if (lat === null || lng === null) return;
    const key = `${lat},${lng}`;
    const point = points.get(key);
    if (point) point.rowIndexes.push(rowIndex);
    else points.set(key, { lat, lng, resolvedName: "", rowIndexes: [rowIndex] });
  });
  return [...points.values()];
}

/** One marker per point with per-category counts from `colorField` (no field: one uncategorised count). */
export function buildMarkers(points: PlacedPoint[], rows: MapRow[], colorField: string | null): MapMarker[] {
  return points.map((point) => {
    const counts = new Map<string, number>();
    for (const rowIndex of point.rowIndexes) {
      const category = colorField ? categoryOf(rows[rowIndex]?.[colorField]) : "";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return {
      lat: point.lat,
      lng: point.lng,
      name: point.resolvedName || null,
      total: point.rowIndexes.length,
      counts: [...counts].map(([category, count]) => ({ category, count })),
      rowIndexes: point.rowIndexes,
    };
  });
}

/** Distinct categories across markers, first-seen order; empty without a color column. */
export function legendCategories(markers: MapMarker[]): string[] {
  const seen = new Set<string>();
  for (const marker of markers) for (const { category } of marker.counts) if (category) seen.add(category);
  return [...seen];
}

const MIN_MARKER_RADIUS = 4;

/** Marker radius so that area is proportional to count; the largest marker gets `maxRadius`. */
export function markerRadius(total: number, maxTotal: number, maxRadius: number, minRadius = MIN_MARKER_RADIUS): number {
  if (maxTotal <= 0 || total <= 0) return minRadius;
  return Math.max(minRadius, maxRadius * Math.sqrt(total / maxTotal));
}

export interface DonutSlice {
  category: string;
  count: number;
  /** SVG path `d` for the ring segment. */
  path: string;
  /** Sweep in radians. */
  angle: number;
}

const point = (cx: number, cy: number, r: number, a: number) =>
  `${(cx + r * Math.sin(a)).toFixed(3)} ${(cy - r * Math.cos(a)).toFixed(3)}`;

/** Ring segments (start at 12 o'clock, clockwise) with angle proportional to each count. */
export function donutSlices(
  counts: Array<{ category: string; count: number }>,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): DonutSlice[] {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total <= 0) return [];
  let start = 0;
  return counts.map(({ category, count }) => {
    const angle = (count / total) * Math.PI * 2;
    let path: string;
    if (counts.length === 1) {
      // A full ring cannot be one arc: draw two half rings.
      path =
        `M ${point(cx, cy, outer, 0)} A ${outer} ${outer} 0 1 1 ${point(cx, cy, outer, Math.PI)} A ${outer} ${outer} 0 1 1 ${point(cx, cy, outer, 0)} ` +
        `M ${point(cx, cy, inner, 0)} A ${inner} ${inner} 0 1 0 ${point(cx, cy, inner, Math.PI)} A ${inner} ${inner} 0 1 0 ${point(cx, cy, inner, 0)} Z`;
    } else {
      const end = start + angle;
      const large = angle > Math.PI ? 1 : 0;
      path =
        `M ${point(cx, cy, outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, end)} ` +
        `L ${point(cx, cy, inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(cx, cy, inner, start)} Z`;
    }
    const slice = { category, count, path, angle };
    start += angle;
    return slice;
  });
}
