import { useEffect, useMemo, useRef, useState } from "react";
import {
  createThreadsClient,
  hydrateThreadCharts,
  threadMessagesToChatMessages,
  type AssistantThreadSummary,
} from "./assistantThreads";
import type { MastraChartMessage, ReportVizBlock, SqlExecutionArtifact } from "./types";

/**
 * Assistant Threads for one Dashboard: the list, the active Thread, and loading/restoring it.
 * Restoring the most recent Thread on mount and every switch go through `onRestore`; a new
 * conversation goes through `onReset`. Stale loads (a newer open or reset won) are ignored.
 */
export function useAssistantThreads({
  threadsUrl,
  dashboardId,
  headers,
  runSqlForRestoredChart,
  onRestore,
  onReset,
}: {
  threadsUrl?: string;
  dashboardId: string;
  headers: Record<string, string>;
  /** Re-runs a restored chart's SQL; null when it cannot be run. */
  runSqlForRestoredChart: (chart: ReportVizBlock) => Promise<SqlExecutionArtifact | null>;
  onRestore: (messages: MastraChartMessage[], thread: AssistantThreadSummary) => void;
  onReset: () => void;
}) {
  const threadsClient = useMemo(
    () => (threadsUrl ? createThreadsClient({ baseUrl: threadsUrl, dashboardId, headers }) : null),
    // headers is a fresh object per render for most hosts; the endpoint, Dashboard and org identify the client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadsUrl, dashboardId, headers["x-organization-id"]],
  );
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<AssistantThreadSummary | null>(null);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const threadLoadSeqRef = useRef(0);

  const openThread = async (thread: AssistantThreadSummary) => {
    if (!threadsClient) return;
    const seq = ++threadLoadSeqRef.current;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const stored = await threadsClient.messages(thread.id);
      const hydrated = await hydrateThreadCharts(
        threadMessagesToChatMessages(stored),
        runSqlForRestoredChart,
      );
      if (seq !== threadLoadSeqRef.current) return;
      onRestore(hydrated, thread);
      setActiveThread(thread);
    } catch (err) {
      if (seq === threadLoadSeqRef.current) {
        setThreadsError(err instanceof Error ? err.message : "Failed to load the conversation");
      }
    } finally {
      if (seq === threadLoadSeqRef.current) setThreadsLoading(false);
    }
  };

  // Restore the most recent Thread on mount.
  useEffect(() => {
    if (!threadsClient) return;
    let cancelled = false;
    setThreadsLoading(true);
    threadsClient
      .list()
      .then((list) => {
        if (cancelled) return;
        setThreads(list);
        if (list[0]) void openThread(list[0]);
        else setThreadsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setThreadsError(err instanceof Error ? err.message : "Failed to load conversations");
        setThreadsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadsClient]);

  const startNewConversation = () => {
    threadLoadSeqRef.current += 1;
    setActiveThread(null);
    setThreadsError(null);
    onReset();
  };

  return {
    threadsClient,
    threads,
    setThreads,
    activeThread,
    setActiveThread,
    threadsError,
    threadsLoading,
    openThread,
    startNewConversation,
  };
}
