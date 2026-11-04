import { describe, expect, it } from "vitest";
import { chartTypesForSpec, isMapVizSpec, withMapCountry } from "./mapKind";
import { chartTypeFromVizSpec, patchVizSpecChartType } from "./blocks/pinnedChartModify";
import { isVizSpec } from "./vizSpecGuard";
import { vizKindOf } from "./ai-chart-modal/vizKind";
import { decideReportMode, looksLikeReportRequest } from "./ai-chart-modal/reportRouting";
import { getJsonRenderPresentationKind } from "./generative-ui/specData";
import type { VizSpec } from "./VizSpecRenderer";

const mapSpec = {
  kind: "map",
  encoding: {
    location: { mode: "latlng", postalCodeField: null, cityField: null, latField: "lat", lngField: "lng" },
    country: "HU",
    colorField: null,
    labelField: null,
    tooltips: null,
  },
} as const;

describe("map kind enumerations", () => {
  it("recognises map specs and accepts them as VizSpecs", () => {
    expect(isMapVizSpec(mapSpec)).toBe(true);
    expect(isMapVizSpec({ kind: "chart" })).toBe(false);
    expect(isMapVizSpec(null)).toBe(false);
    expect(isVizSpec(mapSpec)).toBe(true);
  });

  it("hides every chart type for maps and leaves other kinds unrestricted", () => {
    expect(chartTypesForSpec(mapSpec, ["bar", "pie"])).toEqual([]);
    expect(chartTypesForSpec({ kind: "chart" })).toBeUndefined();
    expect(chartTypesForSpec({ kind: "chart" }, ["bar"])).toEqual(["bar"]);
  });

  it("does not treat a map as a chart in pinned-chart modify helpers", () => {
    expect(chartTypeFromVizSpec(mapSpec)).toBe("");
    expect(patchVizSpecChartType(mapSpec as unknown as VizSpec, "bar")).toBe(mapSpec);
  });

  it("is not a json-render presentation kind", () => {
    expect(getJsonRenderPresentationKind(mapSpec)).toBeNull();
  });

  it("maps to its own selection-tray kind", () => {
    expect(vizKindOf({ chartSpec: mapSpec, jsonRenderSpec: null, presentationKind: "chart" } as never)).toBe("map");
  });

  it("routes a map request to the regular agent, not a report", () => {
    expect(looksLikeReportRequest("devices map", false)).toBe(false);
    expect(decideReportMode({ text: "show my devices on a map", preference: "auto", hasTaggedCharts: false, hasPriorTurns: false })).toBe(false);
  });
});

describe("withMapCountry", () => {
  it("sets an upper-cased country and keeps the rest of the spec", () => {
    const next = withMapCountry(mapSpec, " de ");
    expect((next?.encoding as { country: string }).country).toBe("DE");
    expect((next?.encoding as { location: unknown }).location).toEqual(mapSpec.encoding.location);
  });

  it("refuses non-maps and invalid codes", () => {
    expect(withMapCountry({ kind: "chart" }, "DE")).toBeNull();
    expect(withMapCountry(mapSpec, "DEU")).toBeNull();
    expect(withMapCountry(mapSpec, "")).toBeNull();
  });
});

