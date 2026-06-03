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
});
