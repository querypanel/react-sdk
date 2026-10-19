/** Pure Workspace state: lazy chart ids, @-tag resolution, and the context sent to the Assistant. */
import { isChartBlockType, type ChartBlockSummary } from "./dashboardEditorController";

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

export interface DashboardContextChart {
  id: string;
  title: string;
  kind: string | null;
  sql: string;
  datasourceId: string | null;
}

export interface DashboardContextTaggedChart extends DashboardContextChart {
  /** Full spec (VizSpec or json-render), as stored in the block. */
  spec: unknown;
}

export interface DashboardContext {
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
): DashboardContext {
  const compact = (chart: ChartBlockSummary, index: number) => ({
    id: chart.chartId,
    title: chartLabel(chart, index),
    kind: chart.presentationKind,
    datasourceId: chart.datasourceIds[0] ?? null,
  });
  const { resolved } = resolveTags(taggedChartIds, charts);
  return {
    charts: charts.slice(0, MAX_CONTEXT_CHARTS).map((chart, index) => ({
      ...compact(chart, index),
      sql: truncate(chart.sql, MAX_COMPACT_SQL_LENGTH),
    })),
    tagged: resolved.map((chart) => ({
      ...compact(chart, charts.indexOf(chart)),
      sql: chart.sql,
      spec: getSpec(chart.chartId),
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
