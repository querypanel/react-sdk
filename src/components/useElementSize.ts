import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number | null;
  height: number | null;
}

const UNMEASURED: ElementSize = { width: null, height: null };

/** Content size of the referenced element from one ResizeObserver; both null until measured. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(UNMEASURED);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (width: number, height: number) =>
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    update(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
