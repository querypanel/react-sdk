"use client";

import { useMemo } from "react";
import { ChartBlockFrame } from "../blocks/ChartBlockFrame";
import { resolveChartBlockHeight } from "../blocks/chartBlockHeight";
import { VizSpecRenderer } from "../VizSpecRenderer";
import { defaultColors, getColorsForMode } from "../../themes";
import type { ThemeColors } from "../../types";
import { resolveVizSpecPreview } from "./chartPreviewSpec";

/** Chat preview of a VizSpec: the same renderer and frame the Dashboard Chart block uses. */
export function VizSpecPreview({
  chartSpec,
  fallbackRows,
  darkMode = false,
  themeColors = defaultColors,
  datasourceCount,
}: {
  chartSpec: unknown;
  fallbackRows?: Array<Record<string, unknown>> | null;
  darkMode?: boolean;
  themeColors?: ThemeColors;
  datasourceCount?: number;
}) {
  const colors = useMemo(
    () => getColorsForMode(themeColors, darkMode),
    [themeColors, darkMode],
  );
  const model = useMemo(
    () => resolveVizSpecPreview(chartSpec, fallbackRows ?? null),
    [chartSpec, fallbackRows],
  );

  if (!model.ok) {
    return (
      <div
        style={{
          width: "100%",
          padding: "1rem",
          color: colors.error,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: "0.75rem",
        }}
      >
        {model.error}
      </div>
    );
  }

  return (
    <ChartBlockFrame
      title={(model.spec as { description?: string }).description || "Chart"}
      datasourceCount={datasourceCount}
      height={resolveChartBlockHeight(undefined, model.spec.kind)}
      colors={colors}
    >
      <VizSpecRenderer spec={model.spec} data={model.data} colors={colors} chartHeight="100%" />
    </ChartBlockFrame>
  );
}
