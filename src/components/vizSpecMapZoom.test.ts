import { describe, expect, it } from "vitest";
import { IDENTITY, MAX_ZOOM, MIN_ZOOM, clampZoom, formatLastUpdated, isIdentity, markerScreenScale, panBy, toScreen, wheelFactor, zoomAt } from "./vizSpecMapZoom";

describe("zoom math", () => {
  it("keeps the anchor point fixed when zooming", () => {
    const t = zoomAt(IDENTITY, 2, 100, 50);
    expect(toScreen(t, 100, 50)).toEqual([100, 50]);
    expect(t.k).toBe(2);
  });

  it("clamps the scale", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(zoomAt(IDENTITY, 0.5, 10, 10)).toEqual(IDENTITY);
  });

  it("pans and detects identity", () => {
    const t = panBy(IDENTITY, 5, -3);
    expect(t).toEqual({ k: 1, x: 5, y: -3 });
    expect(isIdentity(t)).toBe(false);
    expect(isIdentity(IDENTITY)).toBe(true);
  });

  it("wheel up zooms in, wheel down zooms out", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });

  it("marker scale stays bounded at every zoom", () => {
    expect(markerScreenScale(1)).toBe(1);
    expect(markerScreenScale(MAX_ZOOM)).toBeLessThanOrEqual(1.5);
    expect(markerScreenScale(0.1)).toBe(1);
  });
});

describe("formatLastUpdated", () => {
  it("formats HH:MM with zero padding", () => {
    expect(formatLastUpdated(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
    expect(formatLastUpdated(new Date(2026, 0, 1, 14, 32).getTime())).toBe("14:32");
  });
});
