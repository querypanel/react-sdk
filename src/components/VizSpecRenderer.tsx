import type { ThemeColors } from "../types";
import { VizSpecChart } from "./VizSpecChart";
import type { ChartSpec } from "./VizSpecChart";
import { VizSpecTable } from "./VizSpecTable";
import type { TableSpec } from "./VizSpecTable";
import { VizSpecMetric } from "./VizSpecMetric";
import type { MetricSpec } from "./VizSpecMetric";
import { VizSpecMap } from "./VizSpecMap";
import type { MapItemNoun, MapSpec } from "./VizSpecMap";
import type { MapTopology } from "./vizSpecMapGeometry";
import type { ResolvePlaces } from "./vizSpecMapPlaces";

// VizSpec union type
export type VizSpec = ChartSpec | TableSpec | MetricSpec | MapSpec;

export interface VizSpecRendererProps {
  spec: VizSpec;
  data: Array<Record<string, unknown>>;
  colors: ThemeColors;
  /** Chart height; pass "100%" when the parent has a fixed height. Defaults to 400px. */
  chartHeight?: number | string;
  /** Map kind only: the country outline (TopoJSON, `objects.country`). */
  mapBoundaries?: MapTopology;
  /** Map kind only: loads the outline for a country code when `mapBoundaries` is not given. */
  fetchMapBoundaries?: (country: string) => Promise<MapTopology>;
  /** Map kind only: resolves postal codes / city names to coordinates. */
  resolveMapPlaces?: ResolvePlaces;
  /** Map kind only: re-fetches the data; shows the map's refresh button. */
  onMapRefresh?: () => Promise<unknown>;
  /** Map kind only: when the data was loaded. */
  mapLastUpdated?: Date | number;
  /** Map kind only: what one row is called in the map's wording (default item / items). */
  mapItemNoun?: MapItemNoun;
}

export function VizSpecRenderer({
  spec,
  data,
  colors,
  chartHeight,
  mapBoundaries,
  fetchMapBoundaries,
  resolveMapPlaces,
  onMapRefresh,
  mapLastUpdated,
  mapItemNoun,
}: VizSpecRendererProps) {
  switch (spec.kind) {
    case "chart":
      return <VizSpecChart spec={spec} data={data} colors={colors} height={chartHeight} />;
    case "table":
      return <VizSpecTable spec={spec} data={data} colors={colors} />;
    case "metric":
      return <VizSpecMetric spec={spec} data={data} colors={colors} />;
    case "map":
      return (
        <VizSpecMap
          spec={spec}
          data={data}
          colors={colors}
          height={chartHeight}
          boundaries={mapBoundaries}
          fetchBoundaries={fetchMapBoundaries}
          resolvePlaces={resolveMapPlaces}
          onRefresh={onMapRefresh}
          lastUpdated={mapLastUpdated}
          itemNoun={mapItemNoun}
        />
      );
    default:
      return (
        <div style={{ padding: "1rem", color: colors.error }}>
          Unsupported visualization type
        </div>
      );
  }
}
