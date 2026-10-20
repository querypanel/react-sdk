"use client";

import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import type { PlanStep } from "./types";

/**
 * Compact live checklist of the agent's plan: hollow dot, spinner, or check per step.
 * `stopped` (the turn ended) shows unfinished steps as muted dots instead of a spinner that never resolves.
 */
export function PlanChecklist({ steps, stopped = false }: { steps: PlanStep[]; stopped?: boolean }) {
	if (steps.length === 0) return null;
	return (
		<ol className="qp-ai-modal-plan" aria-label="Plan">
			{steps.map((step) => (
				<li key={step.id} className="qp-ai-modal-plan-step" data-status={stopped && step.status !== "done" ? "stopped" : step.status}>
					<span className="qp-ai-modal-plan-icon" aria-hidden>
						{step.status === "done" ? (
							<CheckIcon className="w-3 h-3" />
						) : step.status === "in_progress" && !stopped ? (
							<LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
						) : (
							<span className="qp-ai-modal-plan-dot" />
						)}
					</span>
					<span className="qp-ai-modal-plan-title">{step.title}</span>
				</li>
			))}
		</ol>
	);
}
