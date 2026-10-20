import type { PlanStep } from "./types";

/**
 * The agent publishes the plan once (all steps pending) to keep report turns fast, so progress is
 * derived from the charts that have arrived: the first N steps are done, the next one is in progress
 * while the turn runs. A plan the agent did update itself (any non-pending status) is left as is.
 */
export function withDerivedPlanProgress(
  plan: PlanStep[],
  chartCount: number,
  running: boolean,
): PlanStep[] {
  if (plan.length === 0 || plan.some((step) => step.status !== "pending")) return plan;
  const done = Math.min(Math.max(chartCount, 0), plan.length);
  return plan.map((step, index) => {
    if (index < done) return { ...step, status: "done" };
    if (index === done && running) return { ...step, status: "in_progress" };
    return step;
  });
}
