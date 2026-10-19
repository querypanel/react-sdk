import { describe, expect, it } from "vitest";
import { activeDateShortcut, resolveDateRangePreset } from "../dateRangePresets";

describe("resolveDateRangePreset", () => {
  it("resolves relative and calendar presets", () => {
    const now = new Date(2024, 5, 15); // Jun 15, 2024

    expect(resolveDateRangePreset("last_7", undefined, undefined, now)).toEqual({
      from: "2024-06-09",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("last_30", undefined, undefined, now)).toEqual({
      from: "2024-05-17",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("last_90", undefined, undefined, now)).toEqual({
      from: "2024-03-18",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("this_month", undefined, undefined, now)).toEqual({
      from: "2024-06-01",
      to: "2024-06-15",
    });
    expect(resolveDateRangePreset("ytd", undefined, undefined, now)).toEqual({
      from: "2024-01-01",
      to: "2024-06-15",
    });
  });

  it("resolves custom ranges", () => {
    const now = new Date(2024, 5, 15);
    expect(resolveDateRangePreset("custom", "2024-01-01", "2024-02-01", now)).toEqual({
      from: "2024-01-01",
      to: "2024-02-01",
    });
  });
});

describe("activeDateShortcut", () => {
  const now = new Date(2024, 5, 15);

  it("matches persisted params, including datetime values", () => {
    expect(
      activeDateShortcut({ start_date: "2024-06-09", end_date: "2024-06-15" }, now)
    ).toBe("last_7");
    expect(
      activeDateShortcut(
        { start: "2024-05-17 00:00:00", end: "2024-06-15 23:59:59" },
        now
      )
    ).toBe("last_30");
  });

  it("returns empty when params match no shortcut", () => {
    expect(activeDateShortcut({ start: "2024-01-01", end: "2024-01-31" }, now)).toBe("");
    expect(activeDateShortcut({}, now)).toBe("");
  });
});
