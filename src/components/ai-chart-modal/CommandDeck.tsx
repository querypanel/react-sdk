"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  ChevronUpIcon,
  HashIcon,
  LayoutDashboardIcon,
  SparklesIcon,
  TableIcon,
  ZapIcon,
} from "lucide-react";
import { PlanChecklist } from "./PlanChecklist";
import { REPORT_PREFERENCES, type ReportPreference } from "./reportRouting";
import type { PlanStep, ReportVizBlock } from "./types";
import { vizKindOf, type VizKind } from "./vizKind";

/**
 * Pieces of the compact "command deck" (selection tray, plan track, mode switch). Presentational only:
 * AssistantPanel owns the state and handlers, the styles live in AIChartModal.css (.qp-ai-deck-*).
 */

const KIND_META: Record<VizKind, { label: string; Icon: typeof HashIcon }> = {
  metric: { label: "Metric", Icon: HashIcon },
  bar: { label: "Bar chart", Icon: ChartColumnIcon },
  line: { label: "Line chart", Icon: ChartLineIcon },
  pie: { label: "Pie chart", Icon: ChartPieIcon },
  table: { label: "Table", Icon: TableIcon },
  chart: { label: "Chart", Icon: ChartColumnIcon },
};

const FLASH_MS = 1800;

export function SelectionTray({
  blocks,
  isSelected,
  isAdded,
  pendingCount,
  disabled,
  onAddSelected,
  onAddReport,
}: {
  blocks: ReportVizBlock[];
  isSelected: (id: string) => boolean;
  isAdded: (id: string) => boolean;
  pendingCount: number;
  disabled: boolean;
  onAddSelected: () => void;
  onAddReport: () => void;
}) {
  const [flash, setFlash] = useState<"selected" | "report" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const trigger = (which: "selected" | "report", run: () => void) => {
    run();
    setFlash(which);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };
  const allAdded = blocks.length > 0 && blocks.every((b) => isAdded(b.id));
  return (
    <div className="qp-ai-deck-tray" role="group" aria-label="Add to dashboard">
      <div className="qp-ai-deck-tray-info">
        <span className="qp-ai-deck-tray-count">
          {allAdded ? "All added" : `${pendingCount} of ${blocks.length} selected`}
        </span>
        <span className="qp-ai-deck-pips" aria-hidden>
          {blocks.map((block) => {
            const kind = vizKindOf(block);
            const { label, Icon } = KIND_META[kind];
            const added = isAdded(block.id);
            const state = added ? "added" : isSelected(block.id) ? "on" : "off";
            return (
              <span
                key={block.id}
                className="qp-ai-deck-pip"
                data-kind={kind}
                data-state={state}
                title={`${label}${added ? ", added" : state === "on" ? ", selected" : ", not selected"}`}
              >
                {added ? <CheckIcon /> : <Icon />}
              </span>
            );
          })}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => trigger("report", onAddReport)}
        className="qp-ai-deck-ghost"
        data-flash={flash === "report" ? "true" : undefined}
      >
        {flash === "report" ? (
          <>
            <CheckIcon aria-hidden /> Added
          </>
        ) : (
          "Add report"
        )}
      </button>
      <button
        type="button"
        disabled={disabled || pendingCount === 0}
        onClick={() => trigger("selected", onAddSelected)}
        className="qp-ai-deck-primary"
        data-flash={flash === "selected" ? "true" : undefined}
      >
        {flash === "selected" ? (
          <>
            <CheckIcon aria-hidden /> Added
          </>
        ) : (
          <>Add {pendingCount}</>
        )}
      </button>
    </div>
  );
}

export function PlanTrack({
  steps,
  running,
  open,
  onToggle,
  panelId,
}: {
  steps: PlanStep[];
  running: boolean;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  const done = steps.filter((step) => step.status === "done").length;
  const current = running ? steps.find((step) => step.status === "in_progress") : undefined;
  const skipped = !running ? steps.length - done : 0;
  return (
    <div className="qp-ai-deck-plan" data-open={open ? "true" : "false"} data-running={running ? "true" : "false"}>
      {open && (
        <div id={panelId} className="qp-ai-deck-plan-body">
          <PlanChecklist steps={steps} stopped={!running} />
        </div>
      )}
      <button
        type="button"
        className="qp-ai-deck-plan-bar"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Plan, ${done} of ${steps.length} done${skipped > 0 ? `, ${skipped} skipped` : ""}`}
        onClick={onToggle}
      >
        <span className="qp-ai-deck-plan-count">
          {done}/{steps.length}
        </span>
        <span className="qp-ai-deck-plan-segments" aria-hidden>
          {steps.map((step) => {
            const state =
              step.status === "done"
                ? "done"
                : !running
                  ? "skipped"
                  : step.status === "in_progress"
                    ? "running"
                    : "pending";
            return (
              <span key={step.id} className="qp-ai-deck-plan-seg" data-state={state}>
                <span className="qp-ai-deck-plan-fill" />
              </span>
            );
          })}
        </span>
        <span className="qp-ai-deck-plan-label">
          {current ? current.title : skipped > 0 ? `${skipped} skipped` : "done"}
        </span>
        <ChevronUpIcon className="qp-ai-deck-plan-chevron" aria-hidden />
      </button>
    </div>
  );
}

const MODE_META: Record<ReportPreference, { label: string; title: string; Icon: typeof HashIcon }> = {
  auto: {
    label: "Auto",
    title: "Auto: broad topics become a multi-chart report, specific questions get a quick answer",
    Icon: SparklesIcon,
  },
  report: { label: "Report", title: "Report: always plan several charts in parallel", Icon: LayoutDashboardIcon },
  quick: { label: "Quick", title: "Quick: always answer directly with a single result", Icon: ZapIcon },
};

export function ModeSegment({
  value,
  onSelect,
}: {
  value: ReportPreference;
  onSelect: (next: ReportPreference) => void;
}) {
  const index = REPORT_PREFERENCES.indexOf(value);
  return (
    <div
      className="qp-ai-deck-seg"
      role="radiogroup"
      aria-label="Answer mode"
      data-mode={value}
      style={{ ["--qp-seg-index" as string]: index }}
    >
      <span className="qp-ai-deck-seg-thumb" aria-hidden />
      {REPORT_PREFERENCES.map((pref) => {
        const { label, title, Icon } = MODE_META[pref];
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={value === pref}
            aria-label={`Answer mode: ${label}`}
            title={title}
            className="qp-ai-deck-seg-btn"
            onClick={() => onSelect(pref)}
          >
            <Icon aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
