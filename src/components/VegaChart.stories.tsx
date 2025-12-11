import type { Meta, StoryObj } from "@storybook/react";
import { VegaChart } from "./VegaChart";
import { defaultColors, sunsetColors, emeraldColors, oceanColors } from "../themes";

const meta: Meta<typeof VegaChart> = {
  title: "Components/VegaChart",
  component: VegaChart,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Renders Vega-Lite specifications with automatic theming. Supports multiple color presets and custom color configurations.",
      },
    },
  },
  argTypes: {
    spec: {
      description: "Vega-Lite specification object",
      control: "object",
    },
    colors: {
      description: "Theme colors for styling the chart",
      control: "object",
    },
    className: {
      description: "Additional CSS class name",
      control: "text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof VegaChart>;

// Sample Vega-Lite specs
const barChartSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  data: {
    values: [
      { category: "Action", count: 245 },
      { category: "Comedy", count: 312 },
      { category: "Drama", count: 428 },
      { category: "Horror", count: 156 },
      { category: "Sci-Fi", count: 189 },
    ],
  },
  mark: "bar",
  encoding: {
    x: { field: "category", type: "nominal", title: "Genre" },
    y: { field: "count", type: "quantitative", title: "Number of Titles" },
  },
  title: "Netflix Titles by Genre",
};

const lineChartSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  data: {
    values: [
      { year: 2018, count: 120 },
      { year: 2019, count: 185 },
      { year: 2020, count: 245 },
      { year: 2021, count: 312 },
      { year: 2022, count: 278 },
      { year: 2023, count: 356 },
    ],
  },
  mark: { type: "line", point: true },
  encoding: {
    x: { field: "year", type: "ordinal", title: "Year" },
    y: { field: "count", type: "quantitative", title: "Titles Added" },
  },
  title: "Content Growth Over Time",
};

const pieChartSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  data: {
    values: [
      { type: "Movie", count: 6131 },
      { type: "TV Show", count: 2676 },
    ],
  },
  mark: { type: "arc", innerRadius: 50 },
  encoding: {
    theta: { field: "count", type: "quantitative" },
    color: { field: "type", type: "nominal", title: "Content Type" },
  },
  title: "Movies vs TV Shows",
};

const areaChartSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  data: {
    values: [
      { month: "Jan", value: 45 },
      { month: "Feb", value: 52 },
      { month: "Mar", value: 78 },
      { month: "Apr", value: 65 },
      { month: "May", value: 89 },
      { month: "Jun", value: 95 },
    ],
  },
  mark: "area",
  encoding: {
    x: { field: "month", type: "nominal", title: "Month" },
    y: { field: "value", type: "quantitative", title: "Views (millions)" },
  },
  title: "Monthly Viewership",
};

export const BarChart: Story = {
  args: {
    spec: barChartSpec,
    colors: defaultColors,
  },
};

export const LineChart: Story = {
  args: {
    spec: lineChartSpec,
    colors: defaultColors,
  },
};

export const PieChart: Story = {
  args: {
    spec: pieChartSpec,
    colors: defaultColors,
  },
};

export const AreaChart: Story = {
  args: {
    spec: areaChartSpec,
    colors: defaultColors,
  },
};

export const SunsetTheme: Story = {
  args: {
    spec: barChartSpec,
    colors: sunsetColors,
  },
  parameters: {
    docs: {
      description: {
        story: "Bar chart with the warm sunset color preset.",
      },
    },
  },
};

export const EmeraldTheme: Story = {
  args: {
    spec: lineChartSpec,
    colors: emeraldColors,
  },
  parameters: {
    docs: {
      description: {
        story: "Line chart with the emerald/green color preset.",
      },
    },
  },
};

export const OceanTheme: Story = {
  args: {
    spec: pieChartSpec,
    colors: oceanColors,
  },
  parameters: {
    docs: {
      description: {
        story: "Pie chart with the ocean/blue color preset.",
      },
    },
  },
};
