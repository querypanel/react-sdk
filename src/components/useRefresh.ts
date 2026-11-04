import { useCallback, useState } from "react";

/** Wraps a host `onRefresh`: `refreshing` is true while its promise runs; errors are the host's to report. */
export function useRefresh(onRefresh: (() => Promise<unknown>) | undefined): {
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // The host reports its own fetch errors; the "Updated" label keeps the last successful time.
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);
  return { refreshing, refresh };
}
