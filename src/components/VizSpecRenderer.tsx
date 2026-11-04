import type { ThemeColors } from "../types";
import { VizSpecChart } from "./VizSpecChart";
import type { ChartSpec } from "./VizSpecChart";
import { VizSpecTable } from "./VizSpecTable";
import type { TableSpec } from "./VizSpecTable";
import { VizSpecMetric } from "./VizSpecMetric";
import type { MetricSpec } from "./VizSpecMetric";
import { VizSpecMap } from "./VizSpecMap";
import type { MapSpec } from "./VizSpecMap";
import type { MapTopology } from "./vizSpecMapGeometry";

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
}

export function VizSpecRenderer({ spec, data, colors, chartHeight, mapBoundaries, fetchMapBoundaries }: VizSpecRendererProps) {
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
