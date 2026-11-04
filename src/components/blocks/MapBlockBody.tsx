"use client";

import type { ThemeColors } from "../../types";
import type { MapSpec } from "../VizSpecMap";
import { VizSpecRenderer } from "../VizSpecRenderer";
import type { MapGeoClient } from "./mapGeo";

/** A map inside a chart block frame: fills the frame and gets the geo client plus refresh wiring. */
export function MapBlockBody({
  spec,
  rows,
  geo,
  colors,
  lastUpdated,
  onRefresh,
}: {
  spec: MapSpec;
  rows: Array<Record<string, unknown>>;
  geo: MapGeoClient;
  colors: ThemeColors;
  lastUpdated?: number;
  /** Set when the block has SQL to re-run. */
  onRefresh?: () => Promise<void>;
}) {
  return (
    <VizSpecRenderer
      spec={spec}
      data={rows}
      colors={colors}
      chartHeight="100%"
      fetchMapBoundaries={geo.fetchBoundaries}
      resolveMapPlaces={geo.resolvePlaces}
      mapLastUpdated={lastUpdated}
      onMapRefresh={onRefresh}
    />
  );
}
