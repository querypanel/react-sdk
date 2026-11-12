type WithQuery = { sql?: string; queryId?: string };

/**
 * The stored query behind a chart's SQL: the chart's own, else its turn's when the chart runs
 * the turn's SQL (a report chart with different SQL never borrows the turn's id).
 */
export function queryIdFor(chart: WithQuery, turn: WithQuery | undefined): string | undefined {
  return chart.queryId ?? (!chart.sql || chart.sql === turn?.sql ? turn?.queryId : undefined);
}
