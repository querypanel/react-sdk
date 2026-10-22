import { DataTable } from "./DataTable";
import { formatValue, formatTimestampForDisplay } from "../utils/formatters";
import type { ThemeColors } from "../types";

// VizSpec types (copied from querypanel-sdk for now)
type FieldType = "quantitative" | "temporal" | "ordinal" | "nominal" | "boolean";
type TextAlign = "left" | "right" | "center";

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

interface TableColumn extends FieldRef {
  width?: number;
  align?: TextAlign;
  isHidden?: boolean;
}

interface SortSpec {
  field: string;
  direction?: "asc" | "desc";
}

interface TableEncoding {
  columns: TableColumn[];
  sort?: SortSpec;
  limit?: number;
}

export interface TableSpec {
  kind: "table";
  title?: string;
  description?: string;
  encoding: TableEncoding;
}

export interface VizSpecTableProps {
  spec: TableSpec;
  data: Array<Record<string, unknown>>;
  colors: ThemeColors;
}

/**
 * DataTable looks cells up by the displayed column name, so re-key each row by the column label.
 * Without this, any column whose label differs from its field (e.g. "Status" vs `status`) shows "—".
 */
export function toDisplayRows(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ field: string; label?: string | null }>,
): Array<Record<string, unknown>> {
  return rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.label || c.field, row[c.field]])),
  );
}

export function VizSpecTable({ spec, data, colors }: VizSpecTableProps) {
  const { columns, sort, limit } = spec.encoding;

  // Filter out hidden columns
  const visibleColumns = columns.filter((col) => !col.isHidden);

  // Apply sorting if specified
  const sortedData = sort
    ? [...data].sort((a, b) => {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        const direction = sort.direction === "desc" ? -1 : 1;

        if (aVal === null || aVal === undefined) return 1 * direction;
        if (bVal === null || bVal === undefined) return -1 * direction;

        if (typeof aVal === "number" && typeof bVal === "number") {
          return (aVal - bVal) * direction;
        }

        return String(aVal).localeCompare(String(bVal)) * direction;
      })
    : data;

  // Apply limit if specified
  const limitedData = limit ? sortedData.slice(0, limit) : sortedData;

  // Custom cell renderer with formatting (timestamps in browser's local format)
  const renderCell = (value: unknown, field: string) => {
    const column = columns.find((c) => c.field === field);
    if (column?.format) {
      return formatValue(value, column.format);
    }
    return formatTimestampForDisplay(value);
  };

  return (
    <DataTable
      rows={toDisplayRows(limitedData, visibleColumns)}
      fields={visibleColumns.map((c) => c.label || c.field)}
      maxRows={limitedData.length}
      colors={colors}
      renderCell={(value, displayField) => {
        // Map display field (label) back to actual field name
        const column = visibleColumns.find(
          (c) => (c.label || c.field) === displayField
        );
        return renderCell(value, column?.field || displayField);
      }}
    />
  );
}
