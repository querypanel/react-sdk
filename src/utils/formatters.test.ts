import { describe, expect, it } from "vitest";
import { formatTimestampForDisplay } from "./formatters";

describe("formatTimestampForDisplay", () => {
  it("does not treat numeric strings as dates", () => {
    expect(formatTimestampForDisplay("9")).toBe("9");
    expect(formatTimestampForDisplay("1234")).toBe("1234");
    expect(formatTimestampForDisplay("3.5")).toBe("3.5");
  });

  it("leaves plain text alone", () => {
    expect(formatTimestampForDisplay("active")).toBe("active");
  });

  it("formats ISO dates and datetimes", () => {
    const formatted = formatTimestampForDisplay("2026-10-05T22:00:00.000Z");
    expect(formatted).not.toBe("2026-10-05T22:00:00.000Z");
    expect(formatTimestampForDisplay("2026-10-05")).not.toBe("2026-10-05");
  });

  it("formats Date objects and handles null", () => {
    expect(formatTimestampForDisplay(new Date("2026-10-05T22:00:00Z"))).not.toBe("2026-10-05T22:00:00.000Z");
    expect(formatTimestampForDisplay(null)).toBe("—");
  });
});
