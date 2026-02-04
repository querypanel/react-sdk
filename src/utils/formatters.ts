interface ValueFormat {
  style?: "number" | "currency" | "percent" | "date" | "time" | "datetime";
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  dateStyle?: "short" | "medium" | "long";
}

export function formatValue(value: unknown, format?: ValueFormat): string {
  if (value === null || value === undefined) return "—";

  if (!format) return String(value);

  switch (format.style) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: format.currency || "USD",
        minimumFractionDigits: format.minimumFractionDigits,
        maximumFractionDigits: format.maximumFractionDigits,
      }).format(Number(value));

    case "percent":
      return new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: format.minimumFractionDigits,
        maximumFractionDigits: format.maximumFractionDigits,
      }).format(Number(value) / 100);

    case "date":
    case "datetime":
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: format.dateStyle || "medium",
      }).format(new Date(String(value)));

    case "time":
      return new Intl.DateTimeFormat("en-US", {
        timeStyle: format.dateStyle || "medium",
      }).format(new Date(String(value)));

    case "number":
    default:
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: format.minimumFractionDigits,
        maximumFractionDigits: format.maximumFractionDigits,
      }).format(Number(value));
  }
}
