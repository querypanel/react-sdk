import { describe, expect, it } from "vitest";
import type { MastraChartMessage } from "./types";
import { getLatestResultId, getMessageRationale, shouldReuseLatestResultId } from "./chatMessageHelpers";

const message = (patch: Partial<MastraChartMessage>): MastraChartMessage =>
  ({ id: "m", role: "assistant", content: "", ...patch }) as MastraChartMessage;

describe("shouldReuseLatestResultId", () => {
  it("matches follow-ups that re-present the previous result", () => {
    for (const prompt of ["plot that", "Please turn it into a bar chart", "a pie chart", "make it a table"]) {
      expect(shouldReuseLatestResultId(prompt)).toBe(true);
    }
  });

  it("ignores new questions and blank prompts", () => {
    expect(shouldReuseLatestResultId("revenue by month last year")).toBe(false);
    expect(shouldReuseLatestResultId("   ")).toBe(false);
  });
});

describe("getLatestResultId", () => {
  it("returns the newest assistant result id", () => {
    const messages = [message({ resultId: "old" }), message({ role: "user" }), message({ queryResult: { resultId: " new ", rows: [], fields: [], rowCount: 0 } })];
    expect(getLatestResultId(messages)).toBe("new");
    expect(getLatestResultId([message({ role: "user", resultId: "x" })])).toBeUndefined();
  });
});

describe("getMessageRationale", () => {
  it("prefers the rationale and hides generic summaries", () => {
    expect(getMessageRationale(message({ rationale: " Why " }))).toBe("Why");
    expect(getMessageRationale(message({ content: "I processed your request." }))).toBeUndefined();
    expect(getMessageRationale(message({ content: "Signups doubled." }))).toBe("Signups doubled.");
  });
});
