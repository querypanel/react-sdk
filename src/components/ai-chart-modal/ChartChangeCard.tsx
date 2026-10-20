"use client";

import { useEffect, useState, type ReactNode } from "react";
import { VizPreview } from "./ReportTurnView";
import type { ReportVizBlock, SqlExecutionArtifact } from "./types";

export type ChartChangeState = "pending" | "applied" | "discarded";

/**
 * Before/after card for a proposed change to a tagged chart. Nothing on the Dashboard changes
 * until Apply; Apply is a single editor transaction, so Cmd/Ctrl+Z restores the previous chart.
 */
export function ChartChangeCard({
  mode,
  summary,
  after,
  before,
  loadBeforeRows,
  state,
  targetRemoved,
  darkMode,
  onApply,
  onDiscard,
}: {
  mode: "modify" | "replace";
  summary: string;
  /** Default preview of the proposed chart. */
  after: ReactNode;
  /** The chart currently on the Dashboard (null when it was removed). */
  before: ReportVizBlock | null;
  /** Re-runs the current chart's SQL so its preview has rows. */
  loadBeforeRows: (chart: ReportVizBlock) => Promise<SqlExecutionArtifact | null>;
  state: ChartChangeState;
  targetRemoved: boolean;
  darkMode?: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const [beforeRows, setBeforeRows] = useState<SqlExecutionArtifact | null>(null);
  const [beforeFailed, setBeforeFailed] = useState(false);

  useEffect(() => {
    if (!before) return;
    let cancelled = false;
    loadBeforeRows(before)
      .then((rows) => {
        if (cancelled) return;
        if (rows) setBeforeRows(rows);
        else setBeforeFailed(true);
      })
      .catch(() => {
        if (!cancelled) setBeforeFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // The current chart is identified by its id and SQL; reloading on every render would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before?.id, before?.sql]);

  const verb = mode === "modify" ? "Modified" : "Replacement";
  return (
    <div className="qp-ai-change-card">
      <div className="qp-ai-change-summary">
        {verb} chart · {summary}
      </div>
      <div className="qp-ai-change-grid">
        <div>
          <div className="qp-ai-change-label">Current</div>
          {before && !beforeFailed ? (
            <VizPreview
              block={beforeRows ? { ...before, queryResult: beforeRows } : before}
              fallbackRows={beforeRows ? null : []}
              darkMode={darkMode}
            />
          ) : (
            <div className="qp-ai-change-empty">
              {targetRemoved ? "The chart was removed from the Dashboard." : "Current chart preview unavailable."}
            </div>
          )}
        </div>
        <div>
          <div className="qp-ai-change-label">{mode === "modify" ? "Proposed" : "New"}</div>
          {after}
        </div>
      </div>
      <div className="qp-ai-change-actions">
        {state === "pending" ? (
          <>
            <button
              type="button"
              className="qp-ai-modal-add-chart-btn"
              disabled={targetRemoved}
              onClick={onApply}
              title={targetRemoved ? "The chart no longer exists" : "Swap it into the Dashboard (not saved until you Save)"}
            >
              Apply
            </button>
            <button type="button" className="qp-ai-thread-new" onClick={onDiscard}>
              Discard
            </button>
          </>
        ) : (
          <span className="qp-ai-change-result">
            {state === "applied"
              ? "Applied to the Dashboard. Undo with Cmd/Ctrl+Z; Save to keep it."
              : "Discarded. The Dashboard is unchanged."}
          </span>
        )}
      </div>
    </div>
  );
}
