import type { MapRow } from "./vizSpecMapGeometry";

/** A place to resolve: shape of the entries `POST /geo/resolve` takes. */
export interface PlaceInput {
  postalCode: string | null;
  city: string | null;
}

/** Shape of one `POST /geo/resolve` result entry (null = could not be placed). */
export interface ResolvedPlace {
  lat: number;
  lng: number;
  resolvedName: string;
  matchedBy: "postal" | "city";
}

export type ResolvePlaces = (country: string, places: PlaceInput[]) => Promise<Array<ResolvedPlace | null>>;

interface PlaceFields {
  postalCodeField: string | null;
  cityField: string | null;
}

function cell(row: MapRow, field: string | null): string | null {
  if (!field) return null;
  const value = row[field];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

const placeKey = (place: PlaceInput) => `${place.postalCode ?? ""}\u0000${place.city ?? ""}`;

/**
 * Distinct places across the rows (first-seen order) and, per row, the index of its place
 * (-1 when the row has neither a postal code nor a city value).
 */
export function distinctPlaces(rows: MapRow[], fields: PlaceFields): { places: PlaceInput[]; rowPlace: number[] } {
  const places: PlaceInput[] = [];
  const indexByKey = new Map<string, number>();
  const rowPlace = rows.map((row) => {
    const place = { postalCode: cell(row, fields.postalCodeField), city: cell(row, fields.cityField) };
    if (!place.postalCode && !place.city) return -1;
    const key = placeKey(place);
    let index = indexByKey.get(key);
    if (index === undefined) {
      index = places.length;
      indexByKey.set(key, index);
      places.push(place);
    }
    return index;
  });
  return { places, rowPlace };
}

export interface PlacedPoint {
  lat: number;
  lng: number;
  resolvedName: string;
  /** Indexes into the source rows. */
  rowIndexes: number[];
}

/** Rows grouped by resolved coordinates, plus the rows that could not be placed. */
export function placeRows(
  rowPlace: number[],
  results: Array<ResolvedPlace | null>,
): { points: PlacedPoint[]; unplacedRows: number[] } {
  const points = new Map<string, PlacedPoint>();
  const unplacedRows: number[] = [];
  rowPlace.forEach((placeIndex, rowIndex) => {
    const resolved = placeIndex >= 0 ? results[placeIndex] : null;
    if (!resolved) {
      unplacedRows.push(rowIndex);
      return;
    }
    const key = `${resolved.lat},${resolved.lng}`;
    const point = points.get(key);
    if (point) point.rowIndexes.push(rowIndex);
    else points.set(key, { lat: resolved.lat, lng: resolved.lng, resolvedName: resolved.resolvedName, rowIndexes: [rowIndex] });
  });
  return { points: [...points.values()], unplacedRows };
}

/** What to show for an unplaced row: its label, else the location text it carried. */
export function describeRow(row: MapRow, fields: PlaceFields & { labelField: string | null }): string {
  return (
    cell(row, fields.labelField) ??
    [cell(row, fields.postalCodeField), cell(row, fields.cityField)].filter(Boolean).join(" ")
  );
}
