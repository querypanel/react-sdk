import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ThemeColors } from "../types";

// VizSpec types (copied from querypanel-sdk for now)
type FieldType = "quantitative" | "temporal" | "ordinal" | "nominal" | "boolean";
type ChartType = "line" | "bar" | "column" | "area" | "scatter" | "pie";
type AggregateOp = "sum" | "avg" | "min" | "max" | "count" | "distinct";
type TimeUnit = "year" | "quarter" | "month" | "week" | "day" | "hour" | "minute";
type StackingMode = "none" | "stacked" | "percent";

interface ValueFormat {
  style?: "number" | "currency" | "percent" | "date" | "time" | "datetime";
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  dateStyle?: "short" | "medium" | "long";
}

interface FieldRef {
  field: string;
  label?: string;
  type?: FieldType;
  format?: ValueFormat;
}

interface AxisField extends FieldRef {
  aggregate?: AggregateOp;
  timeUnit?: TimeUnit;
}

interface SortSpec {
  field: string;
  direction?: "asc" | "desc";
}

interface ChartEncoding {
  chartType: ChartType;
  x?: AxisField;
  y?: AxisField | AxisField[];
  series?: FieldRef;
  stacking?: StackingMode;
  sort?: SortSpec;
  limit?: number;
  tooltips?: FieldRef[];
}

export interface ChartSpec {
  kind: "chart";
  title?: string;
  description?: string;
  encoding: ChartEncoding;
}

export interface VizSpecChartProps {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  colors: ThemeColors;
}

export function VizSpecChart({ spec, data, colors }: VizSpecChartProps) {
  const { chartType } = spec.encoding;

  // Apply limit if specified
  const limitedData = spec.encoding.limit
    ? data.slice(0, spec.encoding.limit)
    : data;

  // Common props for all charts
  const commonMargin = { top: 20, right: 30, left: 20, bottom: 20 };

  switch (chartType) {
    case "column":
      return renderColumnChart(spec, limitedData, colors, commonMargin);
    case "bar":
      return renderBarChart(spec, limitedData, colors, commonMargin);
    case "line":
      return renderLineChart(spec, limitedData, colors, commonMargin);
    case "area":
      return renderAreaChart(spec, limitedData, colors, commonMargin);
    case "scatter":
      return renderScatterChart(spec, limitedData, colors, commonMargin);
    case "pie":
      return renderPieChart(spec, limitedData, colors);
    default: {
      const _exhaustiveCheck: never = chartType;
      return <div>Unsupported chart type: {_exhaustiveCheck}</div>;
    }
  }
}

// Column Chart (Vertical Bars)
function renderColumnChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors,
  margin: { top: number; right: number; left: number; bottom: number }
) {
  const { x, y, stacking } = spec.encoding;
  const yFields = Array.isArray(y) ? y : y ? [y] : [];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis
          dataKey={x?.field}
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <YAxis stroke={colors.text} tick={{ fill: colors.text }} />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
        {yFields.map((yField, idx) => (
          <Bar
            key={yField.field}
            dataKey={yField.field}
            name={yField.label || yField.field}
            fill={colors.range[idx % colors.range.length]}
            stackId={stacking === "stacked" || stacking === "percent" ? "stack" : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bar Chart (Horizontal Bars)
function renderBarChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors,
  margin: { top: number; right: number; left: number; bottom: number }
) {
  const { x, y, stacking } = spec.encoding;
  const xFields = Array.isArray(x) ? x : x ? [x] : [];
  const yField = Array.isArray(y) ? y[0] : y;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} layout="vertical" margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis type="number" stroke={colors.text} tick={{ fill: colors.text }} />
        <YAxis
          dataKey={yField?.field}
          type="category"
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
        {xFields.map((xField, idx) => (
          <Bar
            key={xField.field}
            dataKey={xField.field}
            name={xField.label || xField.field}
            fill={colors.range[idx % colors.range.length]}
            stackId={stacking === "stacked" || stacking === "percent" ? "stack" : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Line Chart
function renderLineChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors,
  margin: { top: number; right: number; left: number; bottom: number }
) {
  const { x, y } = spec.encoding;
  const yFields = Array.isArray(y) ? y : y ? [y] : [];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis
          dataKey={x?.field}
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <YAxis stroke={colors.text} tick={{ fill: colors.text }} />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
        {yFields.map((yField, idx) => (
          <Line
            key={yField.field}
            type="monotone"
            dataKey={yField.field}
            name={yField.label || yField.field}
            stroke={colors.range[idx % colors.range.length]}
            strokeWidth={2}
            dot={{ fill: colors.range[idx % colors.range.length] }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Area Chart
function renderAreaChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors,
  margin: { top: number; right: number; left: number; bottom: number }
) {
  const { x, y, stacking } = spec.encoding;
  const yFields = Array.isArray(y) ? y : y ? [y] : [];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis
          dataKey={x?.field}
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <YAxis stroke={colors.text} tick={{ fill: colors.text }} />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
        {yFields.map((yField, idx) => (
          <Area
            key={yField.field}
            type="monotone"
            dataKey={yField.field}
            name={yField.label || yField.field}
            stroke={colors.range[idx % colors.range.length]}
            fill={colors.range[idx % colors.range.length]}
            fillOpacity={0.6}
            stackId={stacking === "stacked" || stacking === "percent" ? "stack" : undefined}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Scatter Chart
function renderScatterChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors,
  margin: { top: number; right: number; left: number; bottom: number }
) {
  const { x, y } = spec.encoding;
  const yField = Array.isArray(y) ? y[0] : y;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis
          dataKey={x?.field}
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <YAxis
          dataKey={yField?.field}
          stroke={colors.text}
          tick={{ fill: colors.text }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
        <Scatter
          name={yField?.label || yField?.field || "value"}
          data={data}
          fill={colors.primary}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Pie Chart
function renderPieChart(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
  colors: ThemeColors
) {
  const { x, y } = spec.encoding;
  const nameField = x?.field || "name";
  const valueField = Array.isArray(y) ? y[0]?.field : y?.field || "value";

  return (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueField}
          nameKey={nameField}
          cx="50%"
          cy="50%"
          outerRadius={120}
          label={(entry) => entry[nameField]}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors.range[index % colors.range.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
