import { describe, expect, it } from "vitest";
import { normalizeRowsForJsonRenderChart } from "./specData";

describe("normalizeRowsForJsonRenderChart", () => {
  it("uses persisted labelField and valueField when re-hydrating SQL rows", () => {
    const rows = [
      { tenant_name: "Acme", total_usage: 180_000 },
      { tenant_name: "Beta", total_usage: 95_000 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows, {
      labelField: "tenant_name",
      valueField: "total_usage",
    });

    expect(chartData).toEqual([
      { label: "Acme", value: 180_000 },
      { label: "Beta", value: 95_000 },
    ]);
  });

  it("prefers the largest numeric column as the value when hints are missing", () => {
    const rows = [
      { tenant_name: "Acme", tenant_count: 18, total_usage: 180_000 },
      { tenant_name: "Beta", tenant_count: 10, total_usage: 95_000 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows);

    expect(chartData).toEqual([
      { label: "Acme", value: 180_000 },
      { label: "Beta", value: 95_000 },
    ]);
  });

  it("keeps preformatted label/value points without re-mapping columns", () => {
    const rows = [
      { label: "Acme", value: 180_000 },
      { label: "Beta", value: 95_000 },
    ];

    expect(normalizeRowsForJsonRenderChart(rows)).toEqual(rows);
  });

  it("uses explicit hints when tenant_id is numeric and chart_count is the measure", () => {
    const rows = [
      { tenant_id: 180_001, chart_count: 5 },
      { tenant_id: 95_002, chart_count: 4 },
      { tenant_id: 12_003, chart_count: 1 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows, {
      labelField: "tenant_id",
      valueField: "chart_count",
    });

    expect(chartData).toEqual([
      { label: "180001", value: 5 },
      { label: "95002", value: 4 },
      { label: "12003", value: 1 },
    ]);
  });

  it("prefers chart_count over numeric tenant_id when hints are missing", () => {
    const rows = [
      { tenant_id: 180_001, chart_count: 5 },
      { tenant_id: 95_002, chart_count: 4 },
      { tenant_id: 12_003, chart_count: 1 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows);

    expect(chartData).toEqual([
      { label: "180001", value: 5 },
      { label: "95002", value: 4 },
      { label: "12003", value: 1 },
    ]);
  });

  it("prefers activity_count over numeric tenant_id when hints are missing", () => {
    const rows = [
      { tenant_id: 42, activity_count: 120 },
      { tenant_id: 7, activity_count: 80 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows);

    expect(chartData).toEqual([
      { label: "42", value: 120 },
      { label: "7", value: 80 },
    ]);
  });
});
