import { useEffect, useRef, useState } from "react";

export interface AsyncResult<T> {
  value: T | null;
  error: string | null;
}

const EMPTY: AsyncResult<never> = { value: null, error: null };

/**
 * Runs `loader` once per `key` and returns its settled result for the current key only.
 * `key = null` disables the load. The loader is read from a ref, so its identity never re-triggers the load:
 * only a new key does. A superseded or unmounted load is cancelled in the effect cleanup (StrictMode-safe:
 * the second run starts a fresh load and the first one's result is dropped).
 */
export function useAsyncResult<T>(key: string | null, loader: () => Promise<T>): AsyncResult<T> {
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const [settled, setSettled] = useState<({ key: string } & AsyncResult<T>) | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    loaderRef.current().then(
      (value) => {
        if (!cancelled) setSettled({ key, value, error: null });
      },
      (err: unknown) => {
        if (!cancelled) setSettled({ key, value: null, error: err instanceof Error ? err.message : "unknown error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key !== null && settled?.key === key ? settled : EMPTY;
}
