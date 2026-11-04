import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeColors } from "../types";
import { useElementWidth } from "./useElementWidth";
import { buildMapProjection, projectPoint, type MapTopology } from "./vizSpecMapGeometry";
import {
  assignCategoryColors,
  buildMarkers,
  categoryOf,
  donutSlices,
  groupLatLngRows,
  legendCategories,
  markerRadius,
  type MapMarker,
} from "./vizSpecMapMarkers";
import {
  IDENTITY,
  formatLastUpdated,
  isIdentity,
  markerScreenScale,
  panBy,
  toScreen,
  wheelFactor,
  zoomAt,
  type ZoomTransform,
} from "./vizSpecMapZoom";
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
  /** Re-fetches the data. When supplied, a refresh button is shown; it is disabled while the promise runs. */
  onRefresh?: () => Promise<unknown>;
  /** When the data was loaded, for the "Updated HH:MM" label. Defaults to when `data` last changed. */
  lastUpdated?: Date | number;
}

const DEFAULT_HEIGHT = 400;
const MAX_MARKER_RADIUS = 16;
const DONUT_HOLE = 0.55;
const PANEL_WIDTH = 240;
const DRAG_THRESHOLD = 3;
const BUTTON_ZOOM = 1.6;

function controlStyle(colors: ThemeColors): React.CSSProperties {
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

function markerTitle(marker: MapMarker): string {
  return marker.name ?? `${marker.lat.toFixed(3)}, ${marker.lng.toFixed(3)}`;
}

function Swatch({ color }: { color: string | undefined }) {
  return <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flex: "none" }} />;
}

function overlayStyle(colors: ThemeColors): React.CSSProperties {
  return {
    background: colors.background,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: "0.375rem",
    fontSize: "0.75rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  };
}

/** Tooltip title: resolved place name, else the first row's label, else coordinates. */
function tooltipTitle(marker: MapMarker, data: Array<Record<string, unknown>>, labelField: string | null): string {
  if (marker.name) return marker.name;
  const first = labelField ? data[marker.rowIndexes[0] ?? -1]?.[labelField] : null;
  return first != null && String(first) !== "" ? String(first) : markerTitle(marker);
}

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

export function VizSpecMap({
  spec,
  data,
  colors,
  height = DEFAULT_HEIGHT,
  boundaries,
  fetchBoundaries,
  resolvePlaces,
  onRefresh,
  lastUpdated,
}: VizSpecMapProps) {
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

  const { colorField, labelField, tooltips } = spec.encoding;
  const markers = useMemo(() => {
    const points =
      location.mode === "latlng"
        ? groupLatLngRows(data, location.latField, location.lngField)
        : (placed?.points ?? []);
    return buildMarkers(points, data, colorField);
  }, [data, location.mode, location.latField, location.lngField, placed, colorField]);
  const categories = useMemo(() => legendCategories(markers), [markers]);
  const categoryColors = useMemo(() => assignCategoryColors(categories, colors.range), [categories, colors.range]);

  const [transform, setTransform] = useState<ZoomTransform>(IDENTITY);
  // Start fitted again whenever the fit changes (new country, resize).
  useEffect(() => setTransform(IDENTITY), [fitted]);

  const drawn = useMemo(() => {
    if (!fitted) return [];
    const maxTotal = Math.max(1, ...markers.map((m) => m.total));
    return markers.flatMap((marker, index) => {
      const xy = projectPoint(fitted.projection, marker);
      return xy ? [{ index, marker, x: xy[0], y: xy[1], r: markerRadius(marker.total, maxTotal, MAX_MARKER_RADIUS) }] : [];
    });
  }, [fitted, markers]);
  // Markers live in screen space: positions follow the zoom, sizes barely change (see markerScreenScale).
  const screenDots = useMemo(() => {
    const scale = markerScreenScale(transform.k);
    return drawn.map((d) => {
      const [x, y] = toScreen(transform, d.x, d.y);
      return { ...d, x, y, r: d.r * scale };
    });
  }, [drawn, transform]);
  // Largest first so small markers stay on top and hoverable.
  const drawOrder = useMemo(() => [...screenDots].sort((a, b) => b.r - a.r), [screenDots]);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const svgPoint = (clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    return [clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)];
  };
  const hasMap = Boolean(fitted?.outline);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = svgPoint(e.clientX, e.clientY);
      setTransform((t) => zoomAt(t, wheelFactor(e.deltaY), x, y));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hasMap]);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    if (!moved.current && Math.hypot(next.x - prev.x, next.y - prev.y) < DRAG_THRESHOLD && others.length === 0) return;
    if (!moved.current) {
      moved.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setHovered(null);
    }
    pointers.current.set(e.pointerId, next);
    const other = others[0]?.[1];
    if (other) {
      // Pinch: scale by the change in finger distance around their midpoint, and follow the midpoint.
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(next.x - other.x, next.y - other.y) || 1;
      const [mx, my] = svgPoint((next.x + other.x) / 2, (next.y + other.y) / 2);
      const dx = (next.x - prev.x) / 2;
      const dy = (next.y - prev.y) / 2;
      setTransform((t) => panBy(zoomAt(t, after / before, mx, my), dx, dy));
    } else {
      setTransform((t) => panBy(t, next.x - prev.x, next.y - prev.y));
    }
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const zoomBy = useCallback((factor: number) => setTransform((t) => zoomAt(t, factor, (width ?? 0) / 2, pixelHeight / 2)), [width, pixelHeight]);

  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  useEffect(() => setLoadedAt(Date.now()), [data]);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  // Set to true on every mount too: React dev (StrictMode) runs mount -> cleanup -> mount, and a cleanup-only
  // guard would stay false and leave the Refresh button stuck on "Refreshing…".
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // The host reports its own fetch errors; the label keeps the last successful time.
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };

  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const hoveredDot = screenDots.find((d) => d.index === hovered);
  const selectedMarker = selected === null ? null : (markers[selected] ?? null);

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
        ref={svgRef}
        role="img"
        aria-label={spec.title ?? `Map of ${country}`}
        width={width ?? undefined}
        height={pixelHeight}
        style={{ display: "block", touchAction: "none", cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <path d={fitted.outline} fill={colors.surface} stroke={colors.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {fitted.regionBorders && (
            <path d={fitted.regionBorders} fill="none" stroke={colors.border} strokeOpacity={0.7} strokeWidth={0.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </g>
        {drawOrder.map(({ index, marker, x, y, r }) => (
          <g
            key={index}
            tabIndex={0}
            role="button"
            aria-label={`${markerTitle(marker)}: ${marker.total}`}
            style={{ cursor: "pointer", outline: "none" }}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered((h) => (h === index ? null : h))}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered((h) => (h === index ? null : h))}
            onClick={() => {
              if (!moved.current) setSelected((s) => (s === index ? null : index));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected((s) => (s === index ? null : index));
              }
            }}
          >
            {colorField ? (
              donutSlices(marker.counts, x, y, r, r * DONUT_HOLE).map((slice) => (
                <path
                  key={slice.category}
                  d={slice.path}
                  fillRule="evenodd"
                  fill={categoryColors.get(slice.category)}
                  stroke={colors.background}
                  strokeWidth={1}
                />
              ))
            ) : (
              <circle cx={x} cy={y} r={r} fill={colors.primary} fillOpacity={0.85} stroke={colors.background} strokeWidth={1} />
            )}
            {(hovered === index || selected === index) && (
              <circle cx={x} cy={y} r={r + 2} fill="none" stroke={colors.text} strokeWidth={1.5} />
            )}
          </g>
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
          position: "relative",
        }}
      >
        {body}
        {hasMap && (
          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 4, zIndex: 2 }}>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(BUTTON_ZOOM)} style={controlStyle(colors)}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / BUTTON_ZOOM)} style={controlStyle(colors)}>
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              title="Reset zoom"
              disabled={isIdentity(transform)}
              onClick={() => setTransform(IDENTITY)}
              style={{ ...controlStyle(colors), opacity: isIdentity(transform) ? 0.5 : 1, cursor: isIdentity(transform) ? "default" : "pointer" }}
            >
              ⤢
            </button>
          </div>
        )}
        {hoveredDot && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: hoveredDot.x,
              top: hoveredDot.y - hoveredDot.r - 8,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              zIndex: 2,
              ...overlayStyle(colors),
              padding: "0.375rem 0.5rem",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontWeight: 600 }}>{tooltipTitle(hoveredDot.marker, data, labelField)}</div>
            <div>{hoveredDot.marker.total} {hoveredDot.marker.total === 1 ? "device" : "devices"}</div>
            {colorField &&
              hoveredDot.marker.counts.map(({ category, count }) => (
                <div key={category} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Swatch color={categoryColors.get(category)} />
                  {category}: {count}
                </div>
              ))}
          </div>
        )}
        {selectedMarker && (
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
              ...overlayStyle(colors),
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", padding: "0.5rem 0.625rem", borderBottom: `1px solid ${colors.border}` }}>
              <strong>
                {tooltipTitle(selectedMarker, data, labelField)} ({selectedMarker.total})
              </strong>
              <button
                type="button"
                aria-label="Close device list"
                onClick={() => setSelected(null)}
                style={{ all: "unset", cursor: "pointer", color: colors.muted }}
              >
                ×
              </button>
            </div>
            <ul style={{ margin: 0, padding: "0.375rem 0.625rem", listStyle: "none", overflowY: "auto", flex: 1 }}>
              {selectedMarker.rowIndexes.map((rowIndex) => {
                const row = data[rowIndex] ?? {};
                const label = labelField && row[labelField] != null && String(row[labelField]) !== "" ? String(row[labelField]) : `Row ${rowIndex + 1}`;
                const extras = (tooltips ?? []).filter((f) => row[f] != null && row[f] !== "");
                return (
                  <li key={rowIndex} style={{ padding: "0.25rem 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      {colorField && <Swatch color={categoryColors.get(categoryOf(row[colorField]))} />}
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
        )}
      </div>
      {hasMap && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.25rem 0", fontSize: "0.75rem", color: colors.muted }}>
          <span>Updated {formatLastUpdated(lastUpdated ?? loadedAt)}</span>
          {onRefresh && (
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              style={{ all: "unset", cursor: refreshing ? "default" : "pointer", textDecoration: "underline", opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      )}
      {categories.length > 0 && (
        <ul
          aria-label="Legend"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.875rem", margin: 0, padding: "0.375rem 0.25rem 0", listStyle: "none", fontSize: "0.75rem", color: colors.text }}
        >
          {categories.map((category) => (
            <li key={category} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Swatch color={categoryColors.get(category)} />
              {category}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
