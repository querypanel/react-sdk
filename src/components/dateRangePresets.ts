export type DateRangePreset =
  | "last_7"
  | "last_30"
  | "last_90"
  | "this_month"
  | "ytd"
  | "custom";

export const DATE_RANGE_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: "Last 7 days", value: "last_7" },
  { label: "Last 30 days", value: "last_30" },
  { label: "Last 90 days", value: "last_90" },
  { label: "This month", value: "this_month" },
  { label: "YTD", value: "ytd" },
  { label: "Custom", value: "custom" },
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDateRangePreset(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): { from?: string; to?: string } | null {
  if (preset === "custom") {
    if (!customFrom && !customTo) return null;
    return { from: customFrom || undefined, to: customTo || undefined };
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);

  switch (preset) {
    case "last_7":
      start.setDate(end.getDate() - 6);
      break;
    case "last_30":
      start.setDate(end.getDate() - 29);
      break;
    case "last_90":
      start.setDate(end.getDate() - 89);
      break;
    case "this_month":
      start.setDate(1);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
    default: {
      const _exhaustive: never = preset;
      void _exhaustive;
      return null;
    }
  }

  return { from: toIsoDate(start), to: toIsoDate(end) };
}
