import { geoMercator, geoPath, type GeoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryObject, Topology } from "topojson-specification";

/** Rows are the SQL result rows the map is drawn from. */
export type MapRow = Record<string, unknown>;

export interface MapPoint {
  lat: number;
  lng: number;
  /** Index into the source rows, so later tickets can attach labels/colors. */
  rowIndex: number;
}

/**
 * Topology whose `objects.country` is the country's admin-0 outline (see `GET /geo/boundaries/:country`).
 * `objects.regions` (first-level regions, Natural Earth admin-1) is present only when available.
 */
export type MapTopology = Topology<{ country: GeometryObject; regions?: GeometryObject }>;

/** Parse a coordinate cell (number or numeric string); null when missing/invalid or out of range. */
export function toCoordinate(value: unknown, limit: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

/** One point per row with valid lat/lng; rows with missing or invalid coordinates are skipped. */
export function extractLatLngPoints(rows: MapRow[], latField: string | null, lngField: string | null): MapPoint[] {
  if (!latField || !lngField) return [];
  const points: MapPoint[] = [];
  rows.forEach((row, rowIndex) => {
    const lat = toCoordinate(row[latField], 90);
    const lng = toCoordinate(row[lngField], 180);
    if (lat === null || lng === null) return;
    points.push({ lat, lng, rowIndex });
  });
  return points;
}

export function getCountryFeature(topology: MapTopology): GeoPermissibleObjects | null {
  const object = topology.objects?.country;
  if (!object) return null;
  return feature(topology, object) as GeoPermissibleObjects;
}

export interface MapProjection {
  projection: GeoProjection;
  path: GeoPath;
  outline: string | null;
  /** Borders of the first-level regions; null when the topology has none. */
  regionBorders: string | null;
}

/** Mercator projection fitted into `width` x `height` (with `padding`), plus the outline path string. */
export function buildMapProjection(
  topology: MapTopology,
  width: number,
  height: number,
  padding = 12,
): MapProjection | null {
  const country = getCountryFeature(topology);
  if (!country || width <= 0 || height <= 0) return null;
  const projection = geoMercator().fitExtent(
    [
      [padding, padding],
      [Math.max(padding + 1, width - padding), Math.max(padding + 1, height - padding)],
    ],
    country,
  );
  const path = geoPath(projection);
  const regionsObject = topology.objects.regions;
  const regions = regionsObject ? (feature(topology as Topology, regionsObject) as GeoPermissibleObjects) : null;
  return { projection, path, outline: path(country), regionBorders: regions ? path(regions) : null };
}

/** Project a point to pixel coordinates; null when the projection yields no finite result. */
export function projectPoint(projection: GeoProjection, point: Pick<MapPoint, "lat" | "lng">): [number, number] | null {
  const xy = projection([point.lng, point.lat]);
  if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null;
  return xy;
}
