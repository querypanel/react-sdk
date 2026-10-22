import { describe, expect, it } from "vitest";
import { decideReportMode, looksLikeReportRequest, nextPreference, parseStoredPreference } from "./reportRouting";

const auto = (text: string, hasPriorTurns = false, hasTaggedCharts = false) =>
  decideReportMode({ text, preference: "auto", hasTaggedCharts, hasPriorTurns });

describe("auto routing: broad topics become reports", () => {
  it.each([
    "signups",
    "user growth",
    "revenue",
    "churn",
    "Customer retention",
    "give me a report on signups",
    "signups overview",
    "how are we doing",
    "analyze our onboarding",
    "give me the full picture of revenue",
  ])("%s -> report", (text) => {
    expect(auto(text)).toBe(true);
  });
});

describe("auto routing: specific questions get a quick answer", () => {
  it.each([
    "how many signups are there in total?",
    "what is our revenue",
    "top 5 customers by revenue",
    "signups by plan",
    "signups last month",
    "show me a bar chart of signups",
    "list the newest users",
    "average order value",
    "signups per week",
    "why did signups drop?",
    "count users",
  ])("%s -> quick", (text) => {
    expect(auto(text)).toBe(false);
  });
});

describe("auto routing: conversation state", () => {
  it("short topic words in an existing conversation are follow-ups, not new reports", () => {
    expect(auto("signups", true)).toBe(false);
    expect(auto("make it weekly", true)).toBe(false);
    expect(auto("break that down by source", true)).toBe(false);
  });

  it("an explicit report request still works mid-conversation", () => {
    expect(auto("now give me a report on churn", true)).toBe(false);
    expect(auto("report on churn", true)).toBe(true);
  });

  it("tagged charts always go to the regular agent", () => {
    expect(auto("signups", false, true)).toBe(false);
    expect(decideReportMode({ text: "signups", preference: "report", hasTaggedCharts: true, hasPriorTurns: false })).toBe(false);
  });

  it("empty text is never a report", () => {
    expect(looksLikeReportRequest("   ", false)).toBe(false);
  });
});

describe("manual preference overrides the heuristic", () => {
  it("report always runs a report, quick never does", () => {
    expect(decideReportMode({ text: "how many signups?", preference: "report", hasTaggedCharts: false, hasPriorTurns: true })).toBe(true);
    expect(decideReportMode({ text: "signups", preference: "quick", hasTaggedCharts: false, hasPriorTurns: false })).toBe(false);
  });
});

describe("stored preference", () => {
  it("migrates the old boolean toggle", () => {
    expect(parseStoredPreference("true")).toBe("auto");
    expect(parseStoredPreference("false")).toBe("quick");
    expect(parseStoredPreference(null)).toBe("auto");
    expect(parseStoredPreference("report")).toBe("report");
    expect(parseStoredPreference("garbage")).toBe("auto");
  });

  it("cycles auto, report, quick", () => {
    expect(nextPreference("auto")).toBe("report");
    expect(nextPreference("report")).toBe("quick");
    expect(nextPreference("quick")).toBe("auto");
  });
});
