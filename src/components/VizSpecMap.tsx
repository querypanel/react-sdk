import { useMemo, useRef, useState } from "react";
import type { ThemeColors } from "../types";
import { MapLegend, PlacesFooter } from "./PlacesFooter";
import { MapTooltip } from "./MapTooltip";
import { MarkerPanel } from "./MarkerPanel";
import { useAsyncResult } from "./useAsyncResult";
import { useElementSize } from "./useElementSize";
import { useMapZoom } from "./useMapZoom";
import { useRefresh } from "./useRefresh";
import { buildMapProjection, projectPoint, type MapTopology } from "./vizSpecMapGeometry";
import { DEFAULT_ITEM_NOUN, keepIfPresent, markerIds, markerTitle, type MapItemNoun } from "./vizSpecMapLabels";
import {
  assignCategoryColors,
  buildMarkers,
  donutSlices,
  groupLatLngRows,
  legendCategories,
  markerRadius,
} from "./vizSpecMapMarkers";
import { distinctPlaces, placeRows, type ResolvePlaces } from "./vizSpecMapPlaces";
import { controlStyle } from "./vizSpecMapStyles";
import type { MapSpec } from "./vizSpecMapTypes";
import { IDENTITY, formatLastUpdated, isIdentity, markerScreenScale, toScreen } from "./vizSpecMapZoom";

export type { PlaceInput, ResolvedPlace, ResolvePlaces } from "./vizSpecMapPlaces";
export type { MapEncoding, MapLocation, MapSpec } from "./vizSpecMapTypes";
export type { MapItemNoun } from "./vizSpecMapLabels";

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
  /** What one row is called in the wording ("3 devices couldn't be placed"). Defaults to item / items. */
  itemNoun?: MapItemNoun;
}

const DEFAULT_HEIGHT = 400;
const MAX_MARKER_RADIUS = 16;
const DONUT_HOLE = 0.55;
const BUTTON_ZOOM = 1.6;

/** True when the element matches :focus-visible (keyboard focus); true where the selector is unsupported. */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
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
  itemNoun = DEFAULT_ITEM_NOUN,
}: VizSpecMapProps) {
  const { location, country, colorField, labelField, tooltips } = spec.encoding;
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const width = size.width;
  const numericHeight = typeof height === "number";
  const pixelHeight = numericHeight ? height : (size.height ?? DEFAULT_HEIGHT);

  const fetched = useAsyncResult(!boundaries && fetchBoundaries ? country : null, () => fetchBoundaries!(country));
  const topology = boundaries ?? fetched.value;

  const isPlaceMode = location.mode === "place";
  const placeInfo = useMemo(
    () => (isPlaceMode ? distinctPlaces(data, location) : { places: [], rowPlace: [] as number[] }),
    [isPlaceMode, data, location],
  );
  // Resolve once per distinct (country, places) set, not per data identity.
  const placesKey = useMemo(
    () => (isPlaceMode && resolvePlaces && placeInfo.places.length > 0 ? JSON.stringify([country, placeInfo.places]) : null),
    [isPlaceMode, resolvePlaces, country, placeInfo.places],
  );
  const resolution = useAsyncResult(placesKey, () => resolvePlaces!(country, placeInfo.places));
  const placed = useMemo(() => {
    if (!isPlaceMode) return null;
    if (placeInfo.places.length === 0) return placeRows(placeInfo.rowPlace, []);
    return resolution.value ? placeRows(placeInfo.rowPlace, resolution.value) : null;
  }, [isPlaceMode, placeInfo, resolution.value]);

  const fitted = useMemo(
    () => (topology && width ? buildMapProjection(topology, width, pixelHeight) : null),
    [topology, width, pixelHeight],
  );

  const markers = useMemo(() => {
    const points =
      location.mode === "latlng"
        ? groupLatLngRows(data, location.latField, location.lngField)
        : (placed?.points ?? []);
    return buildMarkers(points, data, colorField);
  }, [data, location.mode, location.latField, location.lngField, placed, colorField]);
  const ids = useMemo(() => markerIds(markers), [markers]);
  const categories = useMemo(() => legendCategories(markers), [markers]);
  const categoryColors = useMemo(() => assignCategoryColors(categories, colors.range), [categories, colors.range]);

  // Hover / keyboard focus / selection are keyed on stable marker ids; one that no longer exists is cleared.
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  if (keepIfPresent(ids, hovered) !== hovered) setHovered(null);
  if (keepIfPresent(ids, focused) !== focused) setFocused(null);
  if (keepIfPresent(ids, selected) !== selected) setSelected(null);

  const hasMap = Boolean(fitted?.outline);
  const { svgRef, transform, setTransform, zoomBy, wasDrag, svgHandlers } = useMapZoom({
    fitted,
    active: hasMap,
    width,
    height: pixelHeight,
    onDragStart: () => setHovered(null),
  });

  const drawn = useMemo(() => {
    if (!fitted) return [];
    const maxTotal = Math.max(1, ...markers.map((m) => m.total));
    return markers.flatMap((marker, index) => {
      const xy = projectPoint(fitted.projection, marker);
      return xy ? [{ id: ids[index] as string, marker, x: xy[0], y: xy[1], r: markerRadius(marker.total, maxTotal, MAX_MARKER_RADIUS) }] : [];
    });
  }, [fitted, markers, ids]);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-stamped when `data` changes, not on every render
  const loadedAt = useMemo(() => Date.now(), [data]);
  const { refreshing, refresh } = useRefresh(onRefresh);

  const control = useMemo(() => controlStyle(colors), [colors]);
  const tipId = hovered ?? focused;
  const tipDot = tipId === null ? undefined : screenDots.find((d) => d.id === tipId);
  const selectedMarker = selected === null ? null : (markers[ids.indexOf(selected)] ?? null);

  let body: React.ReactNode;
  if (isPlaceMode && !resolvePlaces) {
    body = <MapMessage colors={colors}>No place resolver supplied for {country}.</MapMessage>;
  } else if (fetched.error && !topology) {
    body = <MapMessage colors={colors}>Couldn&apos;t load the {country} outline: {fetched.error}</MapMessage>;
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
        // "group" (not "img"): an img role makes screen readers drop the focusable markers inside.
        role="group"
        aria-label={spec.title ?? `Map of ${country}`}
        width={width ?? undefined}
        height={pixelHeight}
        style={{ display: "block", touchAction: "none", cursor: "grab", outline: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
        {...svgHandlers}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <path d={fitted.outline} fill={colors.surface} stroke={colors.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {fitted.regionBorders && (
            <path d={fitted.regionBorders} fill="none" stroke={colors.border} strokeOpacity={0.7} strokeWidth={0.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </g>
        {drawOrder.map(({ id, marker, x, y, r }) => (
          <g
            key={id}
            tabIndex={0}
            role="button"
            aria-label={`${markerTitle(marker)}: ${marker.total}`}
            style={{ cursor: "pointer", outline: "none" }}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
            onFocus={(e) => {
              if (isFocusVisible(e.currentTarget)) setFocused(id);
            }}
            onBlur={() => setFocused((f) => (f === id ? null : f))}
            onClick={() => {
              if (!wasDrag()) setSelected((s) => (s === id ? null : id));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected((s) => (s === id ? null : id));
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
            {(hovered === id || focused === id || selected === id) && (
              <circle cx={x} cy={y} r={r + 2} fill="none" stroke={colors.text} strokeWidth={1.5} />
            )}
          </g>
        ))}
      </svg>
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
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(BUTTON_ZOOM)} style={control}>
              +
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / BUTTON_ZOOM)} style={control}>
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              title="Reset zoom"
              disabled={isIdentity(transform)}
              onClick={() => setTransform(IDENTITY)}
              style={{ ...control, opacity: isIdentity(transform) ? 0.5 : 1, cursor: isIdentity(transform) ? "default" : "pointer" }}
            >
              ⤢
            </button>
          </div>
        )}
        {tipDot && (
          <MapTooltip
            marker={tipDot.marker}
            x={tipDot.x}
            y={tipDot.y}
            r={tipDot.r}
            data={data}
            labelField={labelField}
            showCategories={Boolean(colorField)}
            categoryColors={categoryColors}
            colors={colors}
            noun={itemNoun}
          />
        )}
        {selectedMarker && (
          <MarkerPanel
            marker={selectedMarker}
            data={data}
            labelField={labelField}
            colorField={colorField}
            tooltips={tooltips}
            categoryColors={categoryColors}
            colors={colors}
            noun={itemNoun}
            onClose={() => setSelected(null)}
          />
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
      {categories.length > 0 && <MapLegend categories={categories} categoryColors={categoryColors} colors={colors} />}
      {isPlaceMode && (
        <PlacesFooter
          colors={colors}
          noun={itemNoun}
          data={data}
          describeFields={{ ...location, labelField }}
          resolveError={resolution.error}
          locating={!placed && placeInfo.places.length > 0}
          unplacedRows={placed?.unplacedRows ?? []}
        />
      )}
    </div>
  );
}
