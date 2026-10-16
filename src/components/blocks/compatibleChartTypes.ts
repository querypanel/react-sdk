import type { ChartType } from "../../types";

function isNumericValue(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "bigint") return true;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return true;
  }
  return false;
}

function isTemporalValue(value: unknown): boolean {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // ISO date / datetime-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true;
  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

/**
 * Infer chart types that fit the current result shape.
 * Conservative: prefer bar/column/line/area when there is at least one
 * categorical/temporal field and one numeric; pie only for single-series
 * friendly shapes; scatter when ≥2 numeric fields.
 */
export function compatibleChartTypes(
  fields: string[],
  rows: Array<Record<string, unknown>> = []
): ChartType[] {
  if (fields.length === 0) {
    return ["column", "bar", "line", "area"];
  }

  const sample = rows.slice(0, 25);
  let numericCount = 0;
  let categoricalOrTemporalCount = 0;

  for (const field of fields) {
    const values = sample
      .map((row) => row[field])
      .filter((v) => v !== null && v !== undefined);
    if (values.length === 0) {
      categoricalOrTemporalCount += 1;
      continue;
    }
    const numericHits = values.filter(isNumericValue).length;
    const temporalHits = values.filter(isTemporalValue).length;
    if (numericHits >= Math.ceil(values.length * 0.7) && temporalHits < numericHits) {
      numericCount += 1;
    } else {
      categoricalOrTemporalCount += 1;
    }
  }

  const types: ChartType[] = [];

  if (numericCount >= 1 && categoricalOrTemporalCount >= 1) {
    types.push("column", "bar", "line", "area");
  } else if (numericCount >= 1) {
    types.push("column", "bar", "line", "area");
  } else {
    types.push("column", "bar");
  }

  // Pie: one dimension + one measure (or two fields total)
  if (
    fields.length <= 3 &&
    numericCount >= 1 &&
    categoricalOrTemporalCount >= 1 &&
    numericCount <= 2
  ) {
    types.push("pie");
  }

  if (numericCount >= 2) {
    types.push("scatter");
  }

  // Deduplicate while preserving order
  return [...new Set(types)];
}
