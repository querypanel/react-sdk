import {
  getJsonRenderPresentationKind,
  getJsonRenderTitle,
  isJsonRenderSpecLike,
} from "./generative-ui/specData";

export type ChartBlockType = "chart" | "json-render-chart";

/** What the Assistant (or any host) knows about a chart it wants on the Dashboard. */
export interface ChartPayload {
  chartSpec?: unknown;
  jsonRenderSpec?: unknown;
  rationale?: string;
  sql?: string;
  sqlParams?: Record<string, unknown> | null;
  datasourceIds?: string[];
  tenantFieldName?: string;
  previewTenantId?: string;
  resultId?: string;
}

/** Partial change to an existing Chart block; `title` overrides the derived one. */
export type ChartPatch = ChartPayload & { title?: string };

export interface ChartBlockSummary {
  id: string;
  type: ChartBlockType;
  title: string;
  presentationKind: "chart" | "table" | "metric" | null;
  sql: string;
  datasourceIds: string[];
  resultId: string;
}

export interface InsertChartOptions {
  /** Block to insert next to. Defaults to the block under the text cursor. */
  referenceBlockId?: string;
  placement?: "before" | "after";
}

/** Imperative handle on the Dashboard editor, exposed through `controllerRef`. */
export interface DashboardEditorController {
  listCharts(): ChartBlockSummary[];
  /** Returns the new block id, or undefined when the payload has no spec. */
  insertChart(payload: ChartPayload, options?: InsertChartOptions): string | undefined;
  /** Patch props of a Chart block in one transaction (one undo step). */
  updateChart(blockId: string, patch: ChartPatch): boolean;
  /** Swap a Chart block's spec and metadata in one transaction (one undo step). The block id is kept. */
  replaceChart(blockId: string, payload: ChartPayload): boolean;
  /** Select the block and scroll it into view. */
  focusChart(blockId: string): boolean;
}

type BlockLike = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
};

function chartBlockTypeForSpec(spec: unknown): ChartBlockType {
  return isJsonRenderSpecLike(spec) ? "json-render-chart" : "chart";
}

function specTitle(type: ChartBlockType, spec: unknown): string {
  if (type === "json-render-chart") return getJsonRenderTitle(spec) || "Visualization";
  return (spec as { description?: string } | null | undefined)?.description || "Chart";
}

function metadataProps(type: ChartBlockType, payload: ChartPayload): Record<string, string> {
  return {
    rationale: payload.rationale || "",
    sql: payload.sql || "",
    sqlParams: JSON.stringify(payload.sqlParams || {}),
    datasourceIds: JSON.stringify(payload.datasourceIds || []),
    tenantFieldName: payload.tenantFieldName || "",
    previewTenantId: payload.previewTenantId || "",
    // Only the json-render block stores a result id.
    ...(type === "json-render-chart" ? { resultId: payload.resultId || "" } : {}),
  };
}

/** Block definition for inserting a Chart block, or null when the payload has no spec. */
export function buildChartBlockInput(
  payload: ChartPayload,
): { type: ChartBlockType; props: Record<string, string> } | null {
  const spec = payload.jsonRenderSpec ?? payload.chartSpec;
  if (!spec) return null;

  const type = chartBlockTypeForSpec(spec);
  return {
    type,
    props: {
      [type === "json-render-chart" ? "jsonRenderSpec" : "chartSpec"]: JSON.stringify(spec),
      title: specTitle(type, spec),
      ...metadataProps(type, payload),
    },
  };
}

/**
 * Props to change on an existing Chart block. Only fields present on the patch are
 * touched. Returns null when the patch carries a spec of the other block type —
 * that needs `replaceChart`.
 */
export function buildChartPropsPatch(
  blockType: ChartBlockType,
  patch: ChartPatch,
): Record<string, string> | null {
  const props: Record<string, string> = {};

  const spec = patch.jsonRenderSpec ?? patch.chartSpec;
  if (spec !== undefined) {
    if (chartBlockTypeForSpec(spec) !== blockType) return null;
    props[blockType === "json-render-chart" ? "jsonRenderSpec" : "chartSpec"] =
      JSON.stringify(spec);
    props.title = specTitle(blockType, spec);
  }
  if (patch.title !== undefined) props.title = patch.title;
  if (patch.rationale !== undefined) props.rationale = patch.rationale;
  if (patch.sql !== undefined) props.sql = patch.sql;
  if (patch.sqlParams !== undefined) props.sqlParams = JSON.stringify(patch.sqlParams || {});
  if (patch.datasourceIds !== undefined) props.datasourceIds = JSON.stringify(patch.datasourceIds);
  if (patch.tenantFieldName !== undefined) props.tenantFieldName = patch.tenantFieldName;
  if (patch.previewTenantId !== undefined) props.previewTenantId = patch.previewTenantId;
  if (patch.resultId !== undefined && blockType === "json-render-chart") {
    props.resultId = patch.resultId;
  }
  return props;
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function summarizeChartBlock(block: BlockLike): ChartBlockSummary {
  const type = block.type as ChartBlockType;
  const props = block.props ?? {};
  const spec = parseJson(type === "json-render-chart" ? props.jsonRenderSpec : props.chartSpec);

  let presentationKind: ChartBlockSummary["presentationKind"] = null;
  if (type === "json-render-chart") {
    presentationKind = getJsonRenderPresentationKind(spec);
  } else {
    const kind = (spec as { kind?: unknown } | undefined)?.kind;
    if (kind === "chart" || kind === "table" || kind === "metric") presentationKind = kind;
  }

  const datasourceIds = parseJson(props.datasourceIds);
  return {
    id: block.id,
    type,
    title: typeof props.title === "string" ? props.title : "",
    presentationKind,
    sql: typeof props.sql === "string" ? props.sql : "",
    datasourceIds: Array.isArray(datasourceIds)
      ? datasourceIds.filter((id): id is string => typeof id === "string")
      : [],
    resultId: typeof props.resultId === "string" ? props.resultId : "",
  };
}

export function isChartBlockType(type: string): type is ChartBlockType {
  return type === "chart" || type === "json-render-chart";
}

/** Chart blocks in document order, including ones nested in columns. */
export function listChartBlocks(blocks: ReadonlyArray<BlockLike>): ChartBlockSummary[] {
  const out: ChartBlockSummary[] = [];
  const visit = (list: ReadonlyArray<BlockLike>) => {
    for (const block of list) {
      if (isChartBlockType(block.type)) out.push(summarizeChartBlock(block));
      if (block.children?.length) visit(block.children);
    }
  };
  visit(blocks);
  return out;
}
