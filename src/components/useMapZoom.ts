import { useCallback, useEffect, useRef, useState } from "react";
import { IDENTITY, panBy, wheelFactor, zoomAt, type ZoomTransform } from "./vizSpecMapZoom";

const DRAG_THRESHOLD = 3;

interface Options {
  /** The current projection fit; a new fit (new country, resize) starts fitted again. */
  fitted: object | null;
  /** Whether the svg is mounted (the wheel listener attaches to it). */
  active: boolean;
  width: number | null;
  height: number;
  /** Called once when a press turns into a drag or pinch. */
  onDragStart?: () => void;
}

/** Pan / pinch / wheel / button zoom state for the map svg. The zoom belongs to the fit it was made on. */
export function useMapZoom({ fitted, active, width, height, onDragStart }: Options) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const [zoom, setZoom] = useState<{ fitted: object | null; transform: ZoomTransform }>({ fitted, transform: IDENTITY });
  const transform = zoom.fitted === fitted ? zoom.transform : IDENTITY;
  const setTransform = useCallback(
    (update: ZoomTransform | ((t: ZoomTransform) => ZoomTransform)) =>
      setZoom((z) => {
        const current = z.fitted === fitted ? z.transform : IDENTITY;
        return { fitted, transform: typeof update === "function" ? update(current) : update };
      }),
    [fitted],
  );

  const svgPoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    return [clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)];
  }, []);

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
  }, [active, setTransform, svgPoint]);

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
      onDragStart?.();
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
  const zoomBy = useCallback(
    (factor: number) => setTransform((t) => zoomAt(t, factor, (width ?? 0) / 2, height / 2)),
    [setTransform, width, height],
  );

  return {
    svgRef,
    transform,
    setTransform,
    zoomBy,
    /** True when the last press moved: a click that ends a drag must not select a marker. */
    wasDrag: () => moved.current,
    svgHandlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}
