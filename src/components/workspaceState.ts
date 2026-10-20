/** Pure Workspace state: lazy chart ids, @-tag resolution, and the context sent to the Assistant. */
import {
  buildChartBlockInput,
  isChartBlockType,
  type ChartBlockSummary,
  type ChartPayload,
} from "./dashboardEditorController";

type BlockLike = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
};

export const MAX_CONTEXT_CHARTS = 50;
export const MAX_COMPACT_SQL_LENGTH = 300;

export function generateChartId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `chart_${random}`;
}

/**
 * Chart blocks that need a chart id: ones without one, and later duplicates (copy/paste).
 * Applying the result makes the next call return [], so assignment is idempotent.
 */
export function collectMissingChartIds(
  blocks: ReadonlyArray<BlockLike>,
  generateId: () => string = generateChartId,
): Array<{ blockId: string; chartId: string }> {
  const seen = new Set<string>();
  const missing: Array<{ blockId: string; chartId: string }> = [];
  // Ids already on charts are reserved up front so a generated id never collides with a later block.
  const reserved = new Set<string>();
  const reserve = (list: ReadonlyArray<BlockLike>) => {
    for (const block of list) {
      const id = block.props?.chartId;
      if (isChartBlockType(block.type) && typeof id === "string" && id) reserved.add(id);
      if (block.children?.length) reserve(block.children);
    }
  };
  reserve(blocks);
  const visit = (list: ReadonlyArray<BlockLike>) => {
    for (const block of list) {
      if (isChartBlockType(block.type)) {
        const existing = block.props?.chartId;
        if (typeof existing === "string" && existing && !seen.has(existing)) {
          seen.add(existing);
        } else {
          let chartId = generateId();
          while (seen.has(chartId) || reserved.has(chartId)) chartId = generateId();
          seen.add(chartId);
          missing.push({ blockId: block.id, chartId });
        }
      }
      if (block.children?.length) visit(block.children);
    }
  };
  visit(blocks);
  return missing;
}

/** Picker/chip label; untitled charts get a positional fallback. */
export function chartLabel(chart: Pick<ChartBlockSummary, "title">, index: number): string {
  const title = chart.title.trim();
  return title || `Untitled chart ${index + 1}`;
}

export function filterChartsForPicker(
  charts: ReadonlyArray<ChartBlockSummary>,
  query: string,
): Array<{ chart: ChartBlockSummary; label: string }> {
  const needle = query.trim().toLowerCase();
  return charts
    .map((chart, index) => ({ chart, label: chartLabel(chart, index) }))
    .filter(({ label }) => !needle || label.toLowerCase().includes(needle));
}

/** Tagged charts still on the Dashboard, plus tags whose chart was deleted. */
export function resolveTags(
  taggedChartIds: ReadonlyArray<string>,
  charts: ReadonlyArray<ChartBlockSummary>,
): { resolved: ChartBlockSummary[]; missingIds: string[] } {
  const byId = new Map(charts.map((chart) => [chart.chartId, chart]));
  const resolved: ChartBlockSummary[] = [];
  const missingIds: string[] = [];
  for (const id of new Set(taggedChartIds)) {
    const chart = byId.get(id);
    if (chart) resolved.push(chart);
    else missingIds.push(id);
  }
  return { resolved, missingIds };
}

/** A tagged chart's own datasource wins over the chat's selection. */
export function resolveDatasourceId(
  tagged: ReadonlyArray<Pick<ChartBlockSummary, "datasourceIds">>,
  selectedDatasourceId: string | undefined,
): string | undefined {
  return tagged.find((chart) => chart.datasourceIds.length > 0)?.datasourceIds[0] ?? selectedDatasourceId;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Short per-request handle the Assistant cites in answers as `[↗ c1]`. */
export function chartRefKey(index: number): string {
  return `c${index + 1}`;
}

export interface DashboardContextChart {
  /** Short handle for citing this chart in an answer (`c1`, `c2`, ...). */
  ref: string;
  id: string;
  title: string;
  kind: string | null;
  sql: string;
  datasourceId: string | null;
}

export interface DashboardContextTaggedChart extends DashboardContextChart {
  /** Full spec (VizSpec or json-render), as stored in the block. */
  spec: unknown;
  /** SQL params the chart runs with, so an edit can start from the exact query. */
  params?: Record<string, unknown> | null;
}

export type TagIntent = "investigate" | "modify" | "replace";

export const TAG_INTENT_LABELS: Record<TagIntent, string> = {
  investigate: "Investigate",
  modify: "Modify",
  replace: "Replace",
};

/** Intents a user can switch to: modify/replace need exactly one tagged chart. */
export function selectableIntents(taggedCount: number): TagIntent[] {
  return taggedCount === 1 ? ["investigate", "modify", "replace"] : ["investigate"];
}

/** Next intent when the badge is clicked (cycles); stays put when there is nothing to switch to. */
export function nextIntent(current: TagIntent, taggedCount: number): TagIntent {
  const options = selectableIntents(taggedCount);
  const index = options.indexOf(current);
  return options[(index + 1) % options.length] ?? "investigate";
}

export interface DashboardContext {
  /** Decided Tag intent for this request; the agent defaults to investigate when absent. */
  tagIntent?: TagIntent;
  charts: DashboardContextChart[];
  tagged: DashboardContextTaggedChart[];
}

/**
 * Context for one Assistant request: compact list of all charts, full spec + SQL of tagged ones.
 * `getSpec` reads the live spec for a chart id (specs are not on the summary).
 */
export function buildDashboardContext(
  charts: ReadonlyArray<ChartBlockSummary>,
  taggedChartIds: ReadonlyArray<string>,
  getSpec: (chartId: string) => unknown,
  tagIntent?: TagIntent,
  getParams?: (chartId: string) => Record<string, unknown> | null | undefined,
): DashboardContext {
  const compact = (chart: ChartBlockSummary, index: number) => ({
    ref: chartRefKey(index),
    id: chart.chartId,
    title: chartLabel(chart, index),
    kind: chart.presentationKind,
    datasourceId: chart.datasourceIds[0] ?? null,
  });
  const { resolved } = resolveTags(taggedChartIds, charts);
  return {
    ...(tagIntent ? { tagIntent } : {}),
    charts: charts.slice(0, MAX_CONTEXT_CHARTS).map((chart, index) => ({
      ...compact(chart, index),
      sql: truncate(chart.sql, MAX_COMPACT_SQL_LENGTH),
    })),
    tagged: resolved.map((chart) => ({
      ...compact(chart, charts.indexOf(chart)),
      sql: chart.sql,
      spec: getSpec(chart.chartId),
      ...(getParams ? { params: getParams(chart.chartId) ?? null } : {}),
    })),
  };
}

/** Parsed spec of the chart block with this chart id, or undefined. */
export function findChartSpec(blocks: ReadonlyArray<BlockLike>, chartId: string): unknown {
  for (const block of blocks) {
    if (isChartBlockType(block.type) && block.props?.chartId === chartId) {
      const raw = block.type === "json-render-chart" ? block.props.jsonRenderSpec : block.props.chartSpec;
      if (typeof raw !== "string" || !raw) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    }
    const nested = block.children?.length ? findChartSpec(block.children, chartId) : undefined;
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** An unfinished `@query` at the end of the composer text, or null. */
export function detectMention(text: string): { query: string; start: number } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  if (!match) return null;
  return { query: match[2] ?? "", start: match.index + (match[1]?.length ?? 0) };
}

/** Composer text with the unfinished `@query` removed (the chosen chart becomes a chip instead). */
export function removeMention(text: string): string {
  const mention = detectMention(text);
  return mention ? text.slice(0, mention.start) : text;
}

/** Chart refs a request offered, kept on the answer so its chips can be resolved later. */
export type ChartRefMap = Record<string, { chartId: string; title: string }>;

export function buildChartRefMap(context: DashboardContext): ChartRefMap {
  return Object.fromEntries(context.charts.map((chart) => [chart.ref, { chartId: chart.id, title: chart.title }]));
}

const CHART_REF_PATTERN = /\[↗\s*(c\d+)\s*\]/g;
export const CHART_REF_HREF_PREFIX = "#qp-chart-";

/** Turn `[↗ c1]` in answer markdown into links the renderer shows as chart chips. */
export function linkifyChartRefs(markdown: string): string {
  return markdown.replace(CHART_REF_PATTERN, (_match, ref: string) => `[${ref}](${CHART_REF_HREF_PREFIX}${ref})`);
}

export interface ResolvedChartRef {
  label: string;
  /** Block-independent chart id, when the ref is known. */
  chartId: string | null;
  /** True when the chart is no longer on the Dashboard (or the ref is unknown). */
  removed: boolean;
}

/** Resolve a cited ref against the Dashboard now; removed charts keep their title snapshot. */
export function resolveChartRef(
  ref: string,
  refMap: ChartRefMap | undefined,
  charts: ReadonlyArray<ChartBlockSummary>,
): ResolvedChartRef {
  const entry = refMap?.[ref];
  if (!entry) return { label: ref, chartId: null, removed: true };
  const index = charts.findIndex((chart) => chart.chartId === entry.chartId);
  if (index < 0) return { label: entry.title, chartId: entry.chartId, removed: true };
  return { label: chartLabel(charts[index]!, index), chartId: entry.chartId, removed: false };
}

/** Error text when a message tags a chart that was deleted, else null. */
export function validateTagsForSend(
  taggedChartIds: ReadonlyArray<string>,
  charts: ReadonlyArray<ChartBlockSummary>,
): string | null {
  const { missingIds } = resolveTags(taggedChartIds, charts);
  if (missingIds.length === 0) return null;
  return missingIds.length === 1
    ? "A tagged chart was removed from the Dashboard. Remove its tag to send this message."
    : "Some tagged charts were removed from the Dashboard. Remove their tags to send this message.";
}

function parseJsonProp(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Everything needed to show or re-run a chart that is currently on the Dashboard. */
export interface ChartBlockSnapshot {
  blockId: string;
  chartId: string;
  type: "chart" | "json-render-chart";
  title: string;
  presentationKind: ChartBlockSummary["presentationKind"];
  sql: string;
  params: Record<string, unknown> | null;
  datasourceId: string | undefined;
  chartSpec?: unknown;
  jsonRenderSpec?: unknown;
}

export function findChartBlockSnapshot(
  blocks: ReadonlyArray<BlockLike>,
  chartId: string,
  summaries: ReadonlyArray<ChartBlockSummary>,
): ChartBlockSnapshot | undefined {
  const summary = summaries.find((chart) => chart.chartId === chartId);
  const find = (list: ReadonlyArray<BlockLike>): BlockLike | undefined => {
    for (const block of list) {
      if (isChartBlockType(block.type) && block.props?.chartId === chartId) return block;
      const nested = block.children?.length ? find(block.children) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  const block = find(blocks);
  if (!block || !summary) return undefined;
  const params = parseJsonProp(block.props?.sqlParams);
  const isJsonRender = block.type === "json-render-chart";
  const spec = parseJsonProp(isJsonRender ? block.props?.jsonRenderSpec : block.props?.chartSpec);
  return {
    blockId: block.id,
    chartId,
    type: isJsonRender ? "json-render-chart" : "chart",
    title: summary.title,
    presentationKind: summary.presentationKind,
    sql: summary.sql,
    params: params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : null,
    datasourceId: summary.datasourceIds[0],
    ...(isJsonRender ? { jsonRenderSpec: spec } : { chartSpec: spec }),
  };
}

/** One-line description of what a proposed chart changes compared to the current one. */
export function summarizeChartChange(
  before: { title: string; presentationKind: ChartBlockSummary["presentationKind"]; sql: string },
  after: { title: string; presentationKind: ChartBlockSummary["presentationKind"]; sql: string },
): string {
  const parts: string[] = [];
  if (before.presentationKind !== after.presentationKind && after.presentationKind) {
    parts.push(`Shown as ${after.presentationKind}${before.presentationKind ? ` instead of ${before.presentationKind}` : ""}`);
  }
  const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalize(before.sql) !== normalize(after.sql)) {
    parts.push(after.sql.trim() ? "Updated SQL" : "No SQL");
  } else {
    parts.push("Same SQL");
  }
  const beforeTitle = before.title.trim();
  const afterTitle = after.title.trim();
  if (afterTitle && afterTitle !== beforeTitle) parts.push(`Title: ${beforeTitle || "Untitled"} → ${afterTitle}`);
  return parts.join(" · ");
}

export type ChartChangeMode = "modify" | "replace";

/** The subset of the BlockNote editor an Apply needs (kept narrow so it can be unit tested). */
export interface ChartEditorLike {
  getBlock(id: string): { type: string; props?: Record<string, unknown> } | undefined;
  transact(fn: () => void): void;
  updateBlock(id: string, update: { type: string; props: Record<string, string> }): void;
}

/**
 * Swap a proposed chart into an existing Chart block as ONE editor transaction (one undo step).
 * The block id (position) is always kept. `modify` keeps the chart id; `replace` assigns a new one
 * inside the same transaction so undo never needs a second step. Never saves.
 */
export function applyChartChange(
  editor: ChartEditorLike,
  change: {
    blockId: string;
    mode: ChartChangeMode;
    payload: ChartPayload;
    generateId?: () => string;
  },
): { ok: true; chartId: string } | { ok: false } {
  const block = editor.getBlock(change.blockId);
  if (!block || !isChartBlockType(block.type)) return { ok: false };
  const input = buildChartBlockInput(change.payload);
  if (!input) return { ok: false };

  const existing = block.props?.chartId;
  const generate = change.generateId ?? generateChartId;
  const chartId =
    change.mode === "modify" && typeof existing === "string" && existing ? existing : generate();

  editor.transact(() => {
    editor.updateBlock(change.blockId, {
      type: input.type,
      props: { ...input.props, chartId },
    });
  });
  return { ok: true, chartId };
}

/**
 * The chart an Assistant turn proposes a change to: the preceding user message must have a
 * modify/replace intent and exactly one tagged chart.
 */
export function findChangeTarget(
  messages: ReadonlyArray<{
    id: string;
    role: string;
    intent?: string;
    taggedCharts?: ReadonlyArray<{ chartId: string }>;
  }>,
  assistantMessageId: string,
): { chartId: string; mode: ChartChangeMode } | null {
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  for (let i = index - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role !== "user") continue;
    const tagged = message.taggedCharts ?? [];
    if ((message.intent === "modify" || message.intent === "replace") && tagged.length === 1) {
      return { chartId: tagged[0]!.chartId, mode: message.intent };
    }
    return null;
  }
  return null;
}
