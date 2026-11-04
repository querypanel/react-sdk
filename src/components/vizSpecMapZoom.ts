/** Pan/zoom transform of the map group: screen = base * k + (x, y). */
export interface ZoomTransform {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY: ZoomTransform = { k: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Multiply the scale by `factor`, keeping the screen point (cx, cy) fixed. */
export function zoomAt(t: ZoomTransform, factor: number, cx: number, cy: number): ZoomTransform {
  const k = clampZoom(t.k * factor);
  const ratio = k / t.k;
  return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
}

export const panBy = (t: ZoomTransform, dx: number, dy: number): ZoomTransform => ({ k: t.k, x: t.x + dx, y: t.y + dy });

/** Map a point in the fitted (unzoomed) frame to screen coordinates. */
export const toScreen = (t: ZoomTransform, x: number, y: number): [number, number] => [x * t.k + t.x, y * t.k + t.y];

export const isIdentity = (t: ZoomTransform): boolean => t.k === 1 && t.x === 0 && t.y === 0;

const WHEEL_SENSITIVITY = 0.002;
const WHEEL_MAX_DELTA = 100;

/** Wheel zoom factor from a wheel event's deltaY (ctrl-pinch on trackpads sends small deltas). */
export const wheelFactor = (deltaY: number): number => Math.exp(-Math.max(-WHEEL_MAX_DELTA, Math.min(WHEEL_MAX_DELTA, deltaY)) * WHEEL_SENSITIVITY);

const MARKER_SCALE_EXPONENT = 0.15;
const MAX_MARKER_SCALE = 1.5;

/**
 * Marker radius in screen pixels. Markers are drawn in screen space, not inside the zoomed group,
 * so they keep their size at every zoom; it grows only gently (k^0.15) so zoomed-in markers are not
 * lost against the larger map, and stays capped at 1.5x.
 */
export const markerScreenScale = (k: number): number => Math.min(MAX_MARKER_SCALE, Math.pow(Math.max(1, k), MARKER_SCALE_EXPONENT));

/** "HH:MM" in local time for a Date or epoch milliseconds. */
export function formatLastUpdated(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
