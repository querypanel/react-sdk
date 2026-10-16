import { describe, expect, it } from "vitest";
import { resolveDateRangePreset } from "./PinnedChartControls";

describe("resolveDateRangePreset", () => {
  const now = new Date("2024-06-15T12:00:00Z");

  it("resolves last 7 / 30 / 90 day presets", () => {
    expect(resolveDateRangePreset("last_7", undefined, undefined, now)).toEqual({
      from: "2024-06-09",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("last_30", undefined, undefined, now)).toEqual({
      from: "2024-05-17",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("last_90", undefined, undefined, now)).toEqual({
      from: "2024-03-17",
      to: "2024-06-15",
    });
  });

  it("resolves this month and YTD", () => {
    expect(resolveDateRangePreset("this_month", undefined, undefined, now)).toEqual({
      from: "2024-06-01",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("ytd", undefined, undefined, now)).toEqual({
      from: "2024-01-01",
      to: "2024-06-15",
    });
  });

  it("passes through custom from/to", () => {
    expect(resolveDateRangePreset("custom", "2024-01-01", "2024-02-01", now)).toEqual({
      from: "2024-01-01",
      to: "2024-02-01",
    });
  });
});
