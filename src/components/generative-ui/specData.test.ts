import { describe, expect, it } from "vitest";
import {
  hasInlineJsonRenderData,
  hydrateJsonRenderSpecFromRows,
  injectRowsIntoJsonRenderSpec,
  normalizeRowsForJsonRenderChart,
  pivotSeriesPoints,
  resolveChartFieldHints,
} from "./specData";

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

  it("falls back to auto-detect when explicit field hints yield no points", () => {
    const rows = [
      { signup_week: "2026-05-11", cumulative_users: 1 },
      { signup_week: "2026-05-18", cumulative_users: 3 },
    ];

    const chartData = normalizeRowsForJsonRenderChart(rows, {
      labelField: "week_start",
      valueField: "cumulative_signups",
    });

    expect(chartData).toEqual([
      { label: "2026-05-11", value: 1 },
      { label: "2026-05-18", value: 3 },
    ]);
  });

  it("maps signup_week / cumulative_signed_up_users like the auth.users weekly chart", () => {
    const rows = [
      {
        signup_week: "2026-05-11T00:00:00.000Z",
        weekly_signed_up_users: "3",
        cumulative_signed_up_users: "3",
      },
      {
        signup_week: "2026-05-18T00:00:00.000Z",
        weekly_signed_up_users: "7",
        cumulative_signed_up_users: "10",
      },
    ];

    expect(
      normalizeRowsForJsonRenderChart(rows, {
        labelField: "signup_week",
        valueField: "cumulative_signed_up_users",
      }),
    ).toEqual([
      { label: "2026-05-11T00:00:00.000Z", value: 3 },
      { label: "2026-05-18T00:00:00.000Z", value: 10 },
    ]);
  });

  it("accepts Date labels", () => {
    const rows = [
      { signup_week: new Date("2026-05-11T00:00:00.000Z"), cumulative_signed_up_users: 3 },
    ];

    expect(
      normalizeRowsForJsonRenderChart(rows, {
        labelField: "signup_week",
        valueField: "cumulative_signed_up_users",
      }),
    ).toEqual([{ label: "2026-05-11T00:00:00.000Z", value: 3 }]);
  });
});

describe("injectRowsIntoJsonRenderSpec", () => {
  it("does not clobber an existing series with an empty remap", () => {
    const existing = [
      { label: "2026-05-11T00:00:00.000Z", value: 3 },
      { label: "2026-05-18T00:00:00.000Z", value: 10 },
    ];
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "LineChart",
          props: {
            title: "Accumulated",
            data: existing,
            labelField: "missing_label",
            valueField: "missing_value",
            resultId: "artifact-1",
          },
          children: [],
        },
      },
    };

    const hydrated = injectRowsIntoJsonRenderSpec(spec, [{ not_numeric: "x" }], [
      "not_numeric",
    ]) as typeof spec;

    expect(hydrated.elements.c1.props.data).toEqual(existing);
    expect(hydrated.elements.c1.props.resultId).toBeUndefined();
  });

  it("replaceExisting clears prior series when modify returns no plottable rows", () => {
    const existing = [
      { label: "2026-05-11T00:00:00.000Z", value: 3 },
      { label: "2026-05-18T00:00:00.000Z", value: 10 },
    ];
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "LineChart",
          props: {
            title: "Accumulated",
            data: existing,
            labelField: "week",
            valueField: "total_users",
          },
          children: [],
        },
      },
    };

    const hydrated = injectRowsIntoJsonRenderSpec(spec, [], ["week", "total_users"], {
      replaceExisting: true,
    }) as typeof spec;

    expect(hydrated.elements.c1.props.data).toEqual([]);
  });

  it("keeps resultId when nothing could be inlined, so artifact fetch still works", () => {
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "BarChart",
          props: {
            title: "Revenue",
            labelField: "missing_label",
            valueField: "missing_value",
            resultId: "artifact-1",
          },
          children: [],
        },
      },
    };

    const hydrated = injectRowsIntoJsonRenderSpec(spec, [{ not_numeric: "x" }], [
      "not_numeric",
    ]) as typeof spec;

    expect(hydrated.elements.c1.props.resultId).toBe("artifact-1");
  });
});

describe("hasInlineJsonRenderData", () => {
  it("rejects non-plottable chart data so SQL rows can hydrate the chart", () => {
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "LineChart",
          props: {
            data: [{ label: "2026-05-11T00:00:00.000Z" }],
            resultId: "artifact-1",
            labelField: "week",
            valueField: "cumulative_signed_up_users",
          },
          children: [],
        },
      },
    };

    expect(hasInlineJsonRenderData(spec)).toBe(false);

    const hydrated = injectRowsIntoJsonRenderSpec(
      spec,
      [{ week: "2026-05-11T00:00:00.000Z", cumulative_signed_up_users: 3 }],
      ["week", "cumulative_signed_up_users"],
    ) as typeof spec;

    expect(hydrated.elements.c1.props.data).toEqual([
      { label: "2026-05-11T00:00:00.000Z", value: 3 },
    ]);
  });
});

describe("hydrateJsonRenderSpecFromRows", () => {
  it("preserves the full inline series instead of replacing it with a short transport preview", () => {
    const fullSeries = Array.from({ length: 41 }, (_, index) => ({
      label: `2026-week-${index + 1}`,
      value: index + 1,
    }));
    const previewRows = fullSeries.slice(0, 25).map((point) => ({
      week: point.label,
      cumulative_signed_up_users: point.value,
    }));
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "LineChart",
          props: {
            data: fullSeries,
            resultId: "artifact-1",
            labelField: "week",
            valueField: "cumulative_signed_up_users",
          },
          children: [],
        },
      },
    };

    const hydrated = hydrateJsonRenderSpecFromRows(
      spec,
      previewRows,
      ["week", "cumulative_signed_up_users"],
    ) as typeof spec;

    expect(hydrated.elements.c1.props.data).toEqual(fullSeries);
    expect(hydrated.elements.c1.props.data.at(-1)).toEqual({
      label: "2026-week-41",
      value: 41,
    });
  });

  it("hydrates an empty series from transport preview rows", () => {
    const spec = {
      root: "c1",
      elements: {
        c1: {
          type: "LineChart",
          props: {
            data: [],
            labelField: "week",
            valueField: "cumulative_signed_up_users",
          },
          children: [],
        },
      },
    };

    const hydrated = hydrateJsonRenderSpecFromRows(
      spec,
      [{ week: "2026-08-10", cumulative_signed_up_users: 123 }],
      ["week", "cumulative_signed_up_users"],
    ) as { elements: Record<string, { props: { data: unknown } }> };

    expect(hydrated.elements.c1?.props.data).toEqual([
      { label: "2026-08-10", value: 123 },
    ]);
  });
});

describe("multi-series line charts", () => {
  const rows = [
    { week: "2026-01-12", chamber: "05", hk_ml: "10" },
    { week: "2026-01-05", chamber: "05", hk_ml: "8" },
    { week: "2026-01-05", chamber: "06", hk_ml: "3" },
    { week: "2026-01-12", chamber: "07", hk_ml: "4" },
  ];
  const hints = { labelField: "week", valueField: "hk_ml", seriesField: "chamber" };

  it("tags points with their series when a series field is hinted", () => {
    expect(normalizeRowsForJsonRenderChart(rows, hints)[0]).toEqual({
      label: "2026-01-12",
      value: 10,
      series: "05",
    });
  });

  it("ignores a series field that doubles as label or value", () => {
    const points = normalizeRowsForJsonRenderChart(rows, {
      ...hints,
      seriesField: "week",
    });
    expect(points.every((p) => p.series === undefined)).toBe(true);
  });

  it("pivots to one key per series, sorted by date, leaving gaps for missing points", () => {
    const pivoted = pivotSeriesPoints(normalizeRowsForJsonRenderChart(rows, hints))!;
    expect(pivoted.series.map((s) => s.name)).toEqual(["05", "06", "07"]);
    expect(pivoted.rows).toEqual([
      { label: "2026-01-05", s0: 8, s1: 3 },
      { label: "2026-01-12", s0: 10, s2: 4 },
    ]);
    expect("s1" in pivoted.rows[1]!).toBe(false);
  });

  it("keeps first-appearance order for non-ISO labels such as week numbers", () => {
    const pivoted = pivotSeriesPoints([
      { label: "12", value: 1, series: "a" },
      { label: "5", value: 2, series: "a" },
    ])!;
    expect(pivoted.rows.map((r) => r.label)).toEqual(["12", "5"]);
  });

  it("returns null for single-series points", () => {
    expect(pivotSeriesPoints([{ label: "a", value: 1 }])).toBeNull();
  });

  it("keeps the largest series when there are too many", () => {
    const points = Array.from({ length: 15 }, (_, i) => ({
      label: "2026-01-05",
      value: i + 1,
      series: `c${i}`,
    }));
    const pivoted = pivotSeriesPoints(points, 12)!;
    expect(pivoted.series).toHaveLength(12);
    expect(pivoted.droppedSeries).toBe(3);
    expect(pivoted.series.map((s) => s.name)).not.toContain("c0");
  });
});

describe("field hint resolution", () => {
  const rows = [
    { chamber: "05", additive_ml: "120.5", city: "Pécs", disinfections: "12" },
    { chamber: "06", additive_ml: "90", city: "Győr", disinfections: "8" },
  ];

  it("treats zero-padded codes as labels, not measures", () => {
    const points = normalizeRowsForJsonRenderChart(rows, {
      valueField: "additive_ml",
    });
    expect(points.map((p) => p.label)).toEqual(["05", "06"]);
    expect(points.map((p) => p.value)).toEqual([120.5, 90]);
  });

  it("honours a lone label or value hint instead of guessing", () => {
    const points = normalizeRowsForJsonRenderChart(rows, {
      labelField: "chamber",
    });
    expect(points.map((p) => p.label)).toEqual(["05", "06"]);
  });

  it("drops hints for unknown columns", () => {
    expect(
      resolveChartFieldHints(["a", "b"], { labelField: "x", seriesField: "b" }),
    ).toEqual({ labelField: null, valueField: null, seriesField: "b" });
  });
});
