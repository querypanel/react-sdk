"use client";

import { CheckIcon, LoaderCircleIcon, MinusIcon } from "lucide-react";
import type { PlanStep } from "./types";

/**
 * Compact live checklist of the agent's plan: hollow dot, spinner, or check per step.
 * `stopped` (the turn ended) marks steps that never finished as skipped instead of leaving a spinner or
 * a pending dot that never resolves (the agent skips a metric when its query fails or has no data).
 */
export function PlanChecklist({ steps, stopped = false }: { steps: PlanStep[]; stopped?: boolean }) {
	if (steps.length === 0) return null;
	return (
		<ol className="qp-ai-modal-plan" aria-label="Plan">
			{steps.map((step) => (
				<li
					key={step.id}
					className="qp-ai-modal-plan-step"
					data-status={stopped && step.status !== "done" ? "skipped" : step.status}
				>
					<span className="qp-ai-modal-plan-icon" aria-hidden>
						{step.status === "done" ? (
							<CheckIcon className="w-3 h-3" />
						) : stopped ? (
							<MinusIcon className="w-3 h-3" />
						) : step.status === "in_progress" ? (
							<LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
						) : (
							<span className="qp-ai-modal-plan-dot" />
						)}
					</span>
					<span className="qp-ai-modal-plan-title">{step.title}</span>
					{stopped && step.status !== "done" ? <span className="qp-ai-modal-plan-skipped">skipped</span> : null}
				</li>
			))}
		</ol>
	);
}
