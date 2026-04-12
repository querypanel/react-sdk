import { defineCatalog, type Catalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const dataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});

// Explicit annotation breaks the nested-zod type reference (@json-render/core uses zod v4
// internally while the workspace uses v3, causing a non-portable inferred type in dts build)
export const catalog: Catalog = defineCatalog(schema, {
  components: {
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        description: z.string().nullable(),
      }),
      slots: [] as string[],
      description: "A metric card showing a label, large value, and optional description.",
      example: {
        label: "Revenue",
        value: "$12,345",
        description: "+12% from last month",
      },
    },
    DataTable: {
      props: z.object({
        resultId: z.string().nullable().optional(),
        headers: z.array(z.string()).optional(),
        rows: z.array(z.array(z.string())).optional(),
        caption: z.string().nullable().optional(),
      }),
      slots: [] as string[],
      description: "A data table. Inline headers and rows are preferred; resultId is for backward compatibility only.",
      example: {
        headers: ["Name", "Value"],
        rows: [["Item A", "100"]],
        caption: "Query results",
      },
    },
    BarChart: {
      props: z.object({
        resultId: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        data: z.array(dataPointSchema).optional(),
        xLabel: z.string().nullable().optional(),
        yLabel: z.string().nullable().optional(),
      }),
      slots: [] as string[],
      description: "A bar chart visualizing categorical data. Inline data points are preferred; resultId is for backward compatibility only.",
      example: {
        title: "Sales by Region",
        data: [{ label: "East", value: 120 }, { label: "West", value: 95 }],
      },
    },
    LineChart: {
      props: z.object({
        resultId: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        data: z.array(dataPointSchema).optional(),
        xLabel: z.string().nullable().optional(),
        yLabel: z.string().nullable().optional(),
      }),
      slots: [] as string[],
      description: "A line chart visualizing trends over time or sequential data. Inline data points are preferred; resultId is for backward compatibility only.",
      example: {
        title: "Monthly Revenue",
        data: [{ label: "Jan", value: 5000 }, { label: "Feb", value: 6200 }],
      },
    },
    PieChart: {
      props: z.object({
        resultId: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        data: z.array(dataPointSchema).optional(),
      }),
      slots: [] as string[],
      description: "A pie chart visualizing proportional data. Inline data points are preferred; resultId is for backward compatibility only.",
      example: {
        title: "Market Share",
        data: [{ label: "Product A", value: 60 }, { label: "Product B", value: 40 }],
      },
    },
  },
  actions: {},
});
