import { describe, expect, it } from "vitest";
import { withDerivedPlanProgress } from "./planProgress";
import type { PlanStep } from "./types";

const pending = (n: number): PlanStep[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Step ${i}`, status: "pending" as const }));

describe("withDerivedPlanProgress", () => {
  it("marks one step done per chart and the next one in progress while running", () => {
    const steps = withDerivedPlanProgress(pending(4), 2, true);
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "in_progress", "pending"]);
  });

  it("shows nothing in progress once the turn has ended", () => {
    const steps = withDerivedPlanProgress(pending(3), 1, false);
    expect(steps.map((s) => s.status)).toEqual(["done", "pending", "pending"]);
  });

  it("starts the first step as in progress before any chart exists", () => {
    expect(withDerivedPlanProgress(pending(3), 0, true).map((s) => s.status)).toEqual([
      "in_progress",
      "pending",
      "pending",
    ]);
  });

  it("caps at the number of steps", () => {
    expect(withDerivedPlanProgress(pending(2), 5, true).map((s) => s.status)).toEqual(["done", "done"]);
  });

  it("leaves a plan the agent updated itself untouched", () => {
    const own: PlanStep[] = [
      { id: "a", title: "A", status: "done" },
      { id: "b", title: "B", status: "pending" },
    ];
    expect(withDerivedPlanProgress(own, 0, true)).toBe(own);
  });
});
