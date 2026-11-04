import { describe, expect, it } from "vitest";
import {
  stripEmbeddedDataFromBlocks,
  type BlockLike,
} from "./stripEmbeddedDataFromBlocks";

function readProp(block: BlockLike | undefined, key: string) {
  return block?.props?.[key];
}

describe("stripEmbeddedDataFromBlocks", () => {
  it("removes chart spec data from top-level chart blocks", () => {
    const stripped = stripEmbeddedDataFromBlocks<BlockLike>([
      {
        type: "chart",
        props: {
          chartSpec: JSON.stringify({ kind: "metric", data: [{ value: 1 }] }),
        },
      },
    ]);

    expect(JSON.parse(String(readProp(stripped[0], "chartSpec")))).toEqual({
      kind: "metric",
    });
  });

  it("walks columnList/column children so nested charts are stripped", () => {
    const stripped = stripEmbeddedDataFromBlocks<BlockLike>([
      {
        type: "columnList",
        props: {},
        children: [
          {
            type: "column",
            props: { width: 1 },
            children: [
              {
                type: "chart",
                props: {
                  chartSpec: JSON.stringify({
                    kind: "metric",
                    data: [{ value: 1284 }],
                  }),
                },
              },
            ],
          },
          {
            type: "column",
            props: { width: 1 },
            children: [
              {
                type: "paragraph",
                props: {},
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    const nestedChart = stripped[0].children?.[0].children?.[0];
    expect(JSON.parse(String(readProp(nestedChart, "chartSpec")))).toEqual({
      kind: "metric",
    });
  });

  it("clears json-render resultId and data, including nested blocks", () => {
    const spec = {
      elements: {
        m1: { type: "Metric", props: { value: 12 } },
      },
    };

    const stripped = stripEmbeddedDataFromBlocks<BlockLike>([
      {
        type: "columnList",
        children: [
          {
            type: "column",
            children: [
              {
                type: "json-render-chart",
                props: {
                  jsonRenderSpec: JSON.stringify(spec),
                  resultId: "abc",
                },
              },
            ],
          },
          {
            type: "column",
            children: [],
          },
        ],
      },
    ]);

    const nested = stripped[0].children?.[0].children?.[0];
    expect(readProp(nested, "resultId")).toBe("");
    expect(JSON.parse(String(readProp(nested, "jsonRenderSpec")))).toEqual({
      elements: {
        m1: { type: "Metric", props: {} },
      },
    });
  });

  describe("map specs", () => {
    const mapSpec = {
      kind: "map",
      encoding: {
        country: "HU",
        location: { mode: "latlng", latField: "lat", lngField: "lng" },
        colorField: "status",
      },
    };
    const rows = [{ lat: 47.5, lng: 19, status: "active" }];

    it("strips rows from a chart block but keeps the map spec intact", () => {
      const [block] = stripEmbeddedDataFromBlocks<BlockLike>([
        { type: "chart", props: { chartSpec: JSON.stringify({ ...mapSpec, data: rows }), sql: "select 1" } },
      ]);
      expect(JSON.parse(String(readProp(block, "chartSpec")))).toEqual(mapSpec);
      expect(readProp(block, "sql")).toBe("select 1");
    });

    it("strips rows from a json-render block holding a map spec", () => {
      const [block] = stripEmbeddedDataFromBlocks<BlockLike>([
        {
          type: "json-render-chart",
          props: { jsonRenderSpec: JSON.stringify({ ...mapSpec, data: rows }), resultId: "abc" },
        },
      ]);
      expect(JSON.parse(String(readProp(block, "jsonRenderSpec")))).toEqual(mapSpec);
      expect(readProp(block, "resultId")).toBe("");
    });
  });
});
