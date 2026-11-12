import { useEffect, useMemo, useRef } from "react";
import {
  chartPatchesFromRows,
  collectChartBlocks,
  syncDashboardChartRows,
  type DashboardChartsClient,
} from "./dashboardCharts";
import type { BlockLike } from "./stripEmbeddedDataFromBlocks";

export type ChartRowsEditor = {
  document: unknown;
  updateBlock(blockId: string, update: { props: Record<string, unknown> }): unknown;
  onChange(callback: () => void): (() => void) | void;
};

/** The query a row holds for a block: a stored chart runs this, so it must follow the block. */
const querySignature = (props: Record<string, unknown>) =>
  `${typeof props.sql === "string" ? props.sql : ""}\u0000${typeof props.queryId === "string" ? props.queryId : ""}`;

/**
 * Keeps chart blocks and their dashboard chart rows (sdk_charts) in step:
 * - `load()` fills blocks in from their rows (an admin's edit to an org chart reaches every fork);
 * - `changed()` (on every editor change): when a stored block's query changed, by any path
 *   (pinned controls, the Assistant, the editor controller), its row follows at once, because
 *   the block runs by row id;
 * - `flush()` stores every block before Save (new blocks get a row; title and spec changes follow).
 * Only blocks whose row is known to match are watched, so filling blocks in never syncs back.
 */
export function createChartRowSync(editor: ChartRowsEditor, getClient: () => DashboardChartsClient | undefined) {
  /** Block id → the query its row holds. */
  let synced = new Map<string, string>();
  const chartBlocks = () => collectChartBlocks(editor.document as BlockLike[]);
  const assign = (assigned: Map<string, string>) => {
    for (const [blockId, savedChartId] of assigned) editor.updateBlock(blockId, { props: { savedChartId } });
  };
  const markAllSynced = () => {
    for (const block of chartBlocks()) {
      if (block.props.savedChartId) synced.set(block.id, querySignature(block.props));
    }
  };

  return {
    async load(isCancelled: () => boolean = () => false) {
      synced = new Map();
      const client = getClient();
      if (!client) return;
      const patches = await chartPatchesFromRows(chartBlocks(), client);
      if (isCancelled()) return;
      for (const [blockId, props] of patches) editor.updateBlock(blockId, { props });
      markAllSynced();
    },

    changed() {
      const client = getClient();
      if (!client) return;
      for (const block of chartBlocks()) {
        const known = synced.get(block.id);
        const signature = querySignature(block.props);
        if (!block.props.savedChartId || known === undefined || known === signature) continue;
        synced.set(block.id, signature);
        syncDashboardChartRows([block], client)
          .then(assign)
          .catch((error) => console.warn("[querypanel] Failed to store the changed chart", error));
      }
    },

    /** A failure keeps the blocks as they are (they still save). */
    async flush() {
      const client = getClient();
      if (!client) return;
      try {
        assign(await syncDashboardChartRows(chartBlocks(), client));
        markAllSynced();
      } catch (error) {
        console.warn("[querypanel] Failed to store dashboard charts", error);
      }
    },
  };
}

/** `createChartRowSync` wired to the editor: loads on mount / dashboard change, watches every change. */
export function useDashboardChartRows(editor: ChartRowsEditor, client: DashboardChartsClient | undefined) {
  const clientRef = useRef(client);
  clientRef.current = client;
  const sync = useMemo(() => createChartRowSync(editor, () => clientRef.current), [editor]);

  const url = client?.url;
  useEffect(() => {
    let cancelled = false;
    sync
      .load(() => cancelled)
      .catch((error) => console.warn("[querypanel] Failed to load dashboard charts", error));
    return () => {
      cancelled = true;
    };
  }, [sync, url]);

  useEffect(() => editor.onChange(() => sync.changed()) ?? undefined, [editor, sync]);

  return sync;
}
