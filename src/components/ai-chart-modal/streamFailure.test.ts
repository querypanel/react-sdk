import { describe, expect, it } from "vitest";
import { settleRunningTools, withStreamFailure } from "./streamFailure";
import type { MastraChartMessage, ToolEvent } from "./types";

let counter = 0;
const createId = (prefix: string) => `${prefix}-${++counter}`;

const turn = (patch: Partial<MastraChartMessage> = {}): MastraChartMessage => ({
  id: "a",
  role: "assistant",
  kind: "turn",
  content: "",
  blocks: [],
  timestamp: new Date(),
  ...patch,
});

describe("settleRunningTools", () => {
  it("only closes running events", () => {
    const events: ToolEvent[] = [
      { id: "1", toolName: "x", status: "running", startedAt: 1 },
      { id: "2", toolName: "y", status: "succeeded", startedAt: 1, endedAt: 2 },
    ];
    const [running, done] = settleRunningTools(events, { status: "failed", error: "Failed" });
    expect(running).toMatchObject({ status: "failed", error: "Failed" });
    expect(running!.endedAt).toBeTypeOf("number");
    expect(done).toBe(events[1]);
  });
});

describe("withStreamFailure", () => {
  it("keeps the in-progress turn's text and attaches the error ask", () => {
    const [result] = withStreamFailure(
      [turn({ content: "Partial", blocks: [{ id: "t", type: "text", content: "Partial" }] })],
      "a",
      "Boom",
      [],
      createId,
    );
    expect(result!.content).toBe("Partial");
    expect(result!.blocks).toContainEqual(expect.objectContaining({ type: "ask", content: "Boom" }));
  });

  it("does not add a second ask for the same error", () => {
    const once = withStreamFailure([turn({ content: "Partial" })], "a", "Boom", [], createId);
    const twice = withStreamFailure(once, "a", "Boom", [], createId);
    expect(twice[0]!.blocks).toHaveLength(once[0]!.blocks!.length);
  });

  it("appends a standalone error turn when no turn was started", () => {
    const result = withStreamFailure([], null, "Boom", [], createId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: "assistant", content: "Boom" });
  });
});
