import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeColors } from "../types";
import { useElementWidth } from "./useElementWidth";
import {
  buildMapProjection,
  extractLatLngPoints,
  projectPoint,
  type MapTopology,
} from "./vizSpecMapGeometry";
import { describeRow, distinctPlaces, placeRows, type ResolvePlaces, type ResolvedPlace } from "./vizSpecMapPlaces";

export type { PlaceInput, ResolvedPlace, ResolvePlaces } from "./vizSpecMapPlaces";

// VizSpec types (copied from querypanel-sdk for now)
interface MapLocation {
  mode: "place" | "latlng";
  postalCodeField: string | null;
  cityField: string | null;
  latField: string | null;
  lngField: string | null;
}

interface MapEncoding {
  location: MapLocation;
  country: string;
  colorField: string | null;
  labelField: string | null;
  tooltips: string[] | null;
}

export interface MapSpec {
  kind: "map";
  title?: string;
  description?: string;
  encoding: MapEncoding;
}

export interface VizSpecMapProps {
  spec: MapSpec;
  data: Array<Record<string, unknown>>;
  colors: ThemeColors;
  /** Map height; pass "100%" when the parent has a fixed height. Defaults to 400px. */
  height?: number | string;
  /** Country outline as a loaded TopoJSON topology (`objects.country`). Takes precedence over `fetchBoundaries`. */
  boundaries?: MapTopology;
  /** Loads the outline for `spec.encoding.country` (e.g. from `GET /geo/boundaries/:country`). */
  fetchBoundaries?: (country: string) => Promise<MapTopology>;
  /**
   * Resolves distinct places to coordinates for `location.mode = "place"` (e.g. `POST /geo/resolve`).
   * Called once per render of the data with distinct places only.
   */
  resolvePlaces?: ResolvePlaces;
}

const DEFAULT_HEIGHT = 400;
const DOT_RADIUS = 5;

function MapMessage({ colors, children }: { colors: ThemeColors; children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 120,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        textAlign: "center",
        color: colors.muted,
        fontSize: "0.875rem",
      }}
    >
      {children}
    </div>
  );
}

export function VizSpecMap({ spec, data, colors, height = DEFAULT_HEIGHT, boundaries, fetchBoundaries, resolvePlaces }: VizSpecMapProps) {
  const { location, country } = spec.encoding;
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [fetched, setFetched] = useState<{ country: string; topology: MapTopology } | null>(null);
  const [fetchError, setFetchError] = useState<{ country: string; message: string } | null>(null);

  useEffect(() => {
    if (boundaries || !fetchBoundaries) return;
    let cancelled = false;
    fetchBoundaries(country).then(
      (topology) => {
        if (!cancelled) setFetched({ country, topology });
      },
      (err: unknown) => {
        if (!cancelled) setFetchError({ country, message: err instanceof Error ? err.message : "unknown error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [boundaries, fetchBoundaries, country]);

  const isPlaceMode = location.mode === "place";
  const placeInfo = useMemo(
    () => (isPlaceMode ? distinctPlaces(data, location) : { places: [], rowPlace: [] as number[] }),
    [isPlaceMode, data, location],
  );
  const placesKey = JSON.stringify([country, placeInfo.places]);
  const [resolution, setResolution] = useState<{
    key: string;
    results: Array<ResolvedPlace | null> | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isPlaceMode || !resolvePlaces || placeInfo.places.length === 0) return;
    let cancelled = false;
    resolvePlaces(country, placeInfo.places).then(
      (results) => {
        if (!cancelled) setResolution({ key: placesKey, results, error: null });
      },
      (err: unknown) => {
        if (!cancelled) setResolution({ key: placesKey, results: null, error: err instanceof Error ? err.message : "unknown error" });
      },
    );
    return () => {
      cancelled = true;
    };
    // placesKey stands for (country, placeInfo.places): resolve once per distinct set, not per data identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaceMode, resolvePlaces, placesKey]);

  const current = resolution?.key === placesKey ? resolution : null;
  const placed = useMemo(() => {
    if (!isPlaceMode) return null;
    if (placeInfo.places.length === 0) return placeRows(placeInfo.rowPlace, []);
    return current?.results ? placeRows(placeInfo.rowPlace, current.results) : null;
  }, [isPlaceMode, placeInfo, current]);
  const [showUnplaced, setShowUnplaced] = useState(false);

  const topology = boundaries ?? (fetched?.country === country ? fetched.topology : null);
  const resolvedHeight = typeof height === "number" ? height : undefined;
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  useEffect(() => {
    if (resolvedHeight !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    setMeasuredHeight(el.getBoundingClientRect().height);
  }, [resolvedHeight, width]);
  const pixelHeight = resolvedHeight ?? measuredHeight ?? DEFAULT_HEIGHT;

  const fitted = useMemo(
    () => (topology && width ? buildMapProjection(topology, width, pixelHeight) : null),
    [topology, width, pixelHeight],
  );

  const dots = useMemo(() => {
    if (!fitted) return [];
    const points =
      location.mode === "latlng"
        ? extractLatLngPoints(data, location.latField, location.lngField).map((p) => ({ ...p, key: p.rowIndex }))
        : (placed?.points ?? []).map((p, i) => ({ lat: p.lat, lng: p.lng, key: i }));
    return points.flatMap((point) => {
      const xy = projectPoint(fitted.projection, point);
      return xy ? [{ key: point.key, x: xy[0], y: xy[1] }] : [];
    });
  }, [fitted, data, location.mode, location.latField, location.lngField, placed]);

  let body: React.ReactNode;
  if (isPlaceMode && !resolvePlaces) {
    body = <MapMessage colors={colors}>No place resolver supplied for {country}.</MapMessage>;
  } else if (fetchError && fetchError.country === country && !topology) {
    body = <MapMessage colors={colors}>Couldn&apos;t load the {country} outline: {fetchError.message}</MapMessage>;
  } else if (!boundaries && !fetchBoundaries) {
    body = <MapMessage colors={colors}>No map boundaries supplied for {country}.</MapMessage>;
  } else if (!fitted) {
    body = <MapMessage colors={colors}>Loading map…</MapMessage>;
  } else if (!fitted.outline) {
    body = <MapMessage colors={colors}>The {country} outline is empty.</MapMessage>;
  } else {
    body = (
      <svg
        role="img"
        aria-label={spec.title ?? `Map of ${country}`}
        width={width ?? undefined}
        height={pixelHeight}
        style={{ display: "block" }}
      >
        <path d={fitted.outline} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
        {dots.map((dot) => (
          <circle
            key={dot.key}
            cx={dot.x}
            cy={dot.y}
            r={DOT_RADIUS}
            fill={colors.primary}
            fillOpacity={0.85}
            stroke={colors.background}
            strokeWidth={1}
          />
        ))}
      </svg>
    );
  }

  const numericHeight = typeof height === "number";
  let footer: React.ReactNode = null;
  if (isPlaceMode) {
    const unplaced = placed?.unplacedRows ?? [];
    const labels = { ...location, labelField: spec.encoding.labelField };
    footer = (
      <div style={{ fontSize: "0.75rem", color: colors.muted, padding: "0.375rem 0.25rem 0" }}>
        {current?.error ? (
          <div>Couldn&apos;t resolve places: {current.error}</div>
        ) : !placed && placeInfo.places.length > 0 ? (
          <div>Locating places…</div>
        ) : unplaced.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowUnplaced((v) => !v)}
              aria-expanded={showUnplaced}
              style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}
            >
              {unplaced.length} {unplaced.length === 1 ? "device" : "devices"} couldn&apos;t be placed
            </button>
            {showUnplaced && (
              <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                {unplaced.map((rowIndex) => (
                  <li key={rowIndex}>{describeRow(data[rowIndex] ?? {}, labels) || `Row ${rowIndex + 1}`}</li>
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

  return (
    <div style={{ width: "100%", height: numericHeight ? undefined : height, display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: numericHeight ? `${height}px` : undefined,
          flex: numericHeight ? "none" : 1,
          minHeight: 120,
          boxSizing: "border-box",
          borderRadius: "0.5rem",
          backgroundColor: colors.background,
          border: `1px solid ${colors.border}`,
          overflow: "hidden",
        }}
      >
        {body}
      </div>
      {footer}
    </div>
  );
}
