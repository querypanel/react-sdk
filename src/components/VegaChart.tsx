"use client";

import { useRef, useEffect, useState } from "react";
import type { VisualizationSpec } from "vega-embed";
import type { ThemeColors } from "../types";

export interface VegaChartProps {
  /** Vega-Lite specification */
  spec: VisualizationSpec;
  /** Theme colors for styling the chart */
  colors?: ThemeColors;
  /** Additional class name */
  className?: string;
  /** Error render override */
  renderError?: (error: string) => React.ReactNode;
}

/** Default colors if none provided */
const defaultColors: ThemeColors = {
  primary: "#8B5CF6",
  secondary: "#3B82F6",
  tertiary: "#6366F1",
  accent: "#A855F7",
  range: [
    "#8B5CF6",
    "#3B82F6",
    "#6366F1",
    "#A855F7",
    "#2DD4BF",
    "#FBBF24",
    "#F87171",
    "#4ADE80",
  ],
  text: "#F1F5F9",
  muted: "#94A3B8",
  grid: "rgba(139,92,246,0.1)",
  background: "#0a0612",
  surface: "rgba(0,0,0,0.4)",
  border: "rgba(139,92,246,0.2)",
  error: "#EF4444",
};

export function VegaChart({
  spec,
  colors = defaultColors,
  className = "",
  renderError,
}: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const renderChart = async () => {
      try {
        const vegaEmbed = (await import("vega-embed")).default;
        if (!mounted || !containerRef.current) return;

        const themedSpec = JSON.parse(JSON.stringify(spec)) as Record<
          string,
          unknown
        >;

        // Responsive sizing
        themedSpec.width = "container";
        themedSpec.autosize = { type: "fit", contains: "padding" };

        // Apply theme config
        if (!themedSpec.config) {
          themedSpec.config = {};
        }
        const config = themedSpec.config as Record<string, unknown>;

        config.background = "transparent";
        config.view = { stroke: null };
        config.autosize = { type: "fit", contains: "padding" };
        config.range = { category: colors.range };

        // Mark styles
        config.bar = { fill: colors.primary, cornerRadiusEnd: 4 };
        config.line = { stroke: colors.primary, strokeWidth: 3 };
        config.point = { fill: colors.primary, size: 80 };
        config.arc = { stroke: colors.background, strokeWidth: 2, innerRadius: 0 };
        config.area = { fill: colors.primary, fillOpacity: 0.6 };

        // Title styles
        if (!config.title) config.title = {};
        (config.title as Record<string, unknown>).color = colors.text;
        (config.title as Record<string, unknown>).fontSize = 18;
        (config.title as Record<string, unknown>).fontWeight = 700;
        (config.title as Record<string, unknown>).anchor = "start";
        (config.title as Record<string, unknown>).font =
          "system-ui, -apple-system, sans-serif";

        // Axis styles
        if (!config.axis) config.axis = {};
        (config.axis as Record<string, unknown>).labelColor = colors.muted;
        (config.axis as Record<string, unknown>).titleColor = colors.muted;
        (config.axis as Record<string, unknown>).gridColor = colors.grid;
        (config.axis as Record<string, unknown>).domainColor = colors.border;
        (config.axis as Record<string, unknown>).tickColor = "transparent";

        // Legend styles
        if (!config.legend) config.legend = {};
        (config.legend as Record<string, unknown>).labelColor = colors.muted;
        (config.legend as Record<string, unknown>).titleColor = colors.text;

        // Detect pie chart
        const markType =
          typeof themedSpec.mark === "string"
            ? themedSpec.mark
            : (themedSpec.mark as Record<string, unknown>)?.type;
        const isPieChart = markType === "arc";

        // Clean up redundant color encodings (but NOT for pie charts)
        const encoding = themedSpec.encoding as
          | Record<string, unknown>
          | undefined;
        if (encoding && !isPieChart) {
          const colorEnc = encoding.color as Record<string, unknown> | undefined;
          const xEnc = encoding.x as Record<string, unknown> | undefined;
          const yEnc = encoding.y as Record<string, unknown> | undefined;

          if (colorEnc && typeof colorEnc === "object") {
            const colorField = colorEnc.field;
            if (colorField === xEnc?.field || colorField === yEnc?.field) {
              delete encoding.color;
            }
            if (
              colorEnc.aggregate ||
              (colorEnc.type === "quantitative" && !colorEnc.field)
            ) {
              delete encoding.color;
            }
          }
        }

        // For pie charts, ensure the color scale uses theme colors
        if (isPieChart && encoding?.color) {
          const colorEnc = encoding.color as Record<string, unknown>;
          if (!colorEnc.scale) {
            colorEnc.scale = {};
          }
          (colorEnc.scale as Record<string, unknown>).range = colors.range;
        }

        containerRef.current.innerHTML = "";
        await vegaEmbed(containerRef.current, themedSpec as VisualizationSpec, {
          actions: false,
          renderer: "svg",
        });
        setError(null);
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to render chart"
          );
        }
      }
    };

    renderChart();
    return () => {
      mounted = false;
    };
  }, [spec, colors]);

  if (error) {
    if (renderError) {
      return <>{renderError(error)}</>;
    }
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "16rem",
          color: colors.error,
          fontSize: "0.875rem",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ marginRight: "0.5rem" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ width: "100%" }} />;
}
