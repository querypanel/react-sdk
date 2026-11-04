import type { ReportVizBlock } from "./types";

/** Coarse chart family used for the small glyph/color pips in the selection tray. */
export type VizKind = "metric" | "bar" | "line" | "pie" | "table" | "map" | "chart";

function parseSpec(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function chartFamily(chartType: unknown): VizKind {
  const type = typeof chartType === "string" ? chartType.toLowerCase() : "";
  if (type.includes("pie") || type.includes("donut")) return "pie";
  if (type.includes("line") || type.includes("area")) return "line";
  if (type.includes("bar") || type.includes("column")) return "bar";
  return "chart";
}

/** Derives the pip kind from the viz spec (kind + encoding.chartType), falling back to presentationKind. */
export function vizKindOf(block: Pick<ReportVizBlock, "chartSpec" | "jsonRenderSpec" | "presentationKind">): VizKind {
  const spec = parseSpec(block.chartSpec) ?? parseSpec(block.jsonRenderSpec);
  if (spec?.kind === "metric") return "metric";
  if (spec?.kind === "table") return "table";
  if (spec?.kind === "map") return "map";
  if (spec?.kind === "chart") {
    const encoding = spec.encoding as { chartType?: unknown } | undefined;
    return chartFamily(encoding?.chartType);
  }
  if (block.presentationKind === "metric") return "metric";
  if (block.presentationKind === "table") return "table";
  return "chart";
}
