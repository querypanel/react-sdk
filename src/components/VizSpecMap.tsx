import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeColors } from "../types";
import { useElementWidth } from "./useElementWidth";
import {
  buildMapProjection,
  extractLatLngPoints,
  projectPoint,
  type MapTopology,
} from "./vizSpecMapGeometry";

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

export function VizSpecMap({ spec, data, colors, height = DEFAULT_HEIGHT, boundaries, fetchBoundaries }: VizSpecMapProps) {
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
    if (!fitted || location.mode !== "latlng") return [];
    return extractLatLngPoints(data, location.latField, location.lngField).flatMap((point) => {
      const xy = projectPoint(fitted.projection, point);
      return xy ? [{ key: point.rowIndex, x: xy[0], y: xy[1] }] : [];
    });
  }, [fitted, data, location.mode, location.latField, location.lngField]);

  let body: React.ReactNode;
  if (location.mode === "place") {
    body = <MapMessage colors={colors}>Place resolution arrives with geocoding.</MapMessage>;
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

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: typeof height === "number" ? `${height}px` : height,
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
  );
}
