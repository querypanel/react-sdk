import type { VisualizationSpec } from "vega-embed";

// Re-export vega types for convenience
export type { VisualizationSpec };

/** Chart type options */
export type ChartType = "bar" | "line" | "area" | "scatter" | "pie";

/** Time granularity for date-based queries */
export type TimeUnit = "day" | "week" | "month" | "quarter" | "year";

/** SQL modification options */
export interface SqlModifications {
  timeGranularity?: TimeUnit;
  dateRange?: {
    from?: string;
    to?: string;
  };
}

/** Visualization modification options */
export interface VizModifications {
  chartType?: ChartType;
  xAxis?: { field: string };
  yAxis?: { field: string };
}

/** Chart response from API */
export interface ChartResponse {
  vegaLiteSpec?: Record<string, unknown> | null;
  vizSpec?: Record<string, unknown> | null;
  specType: "vega-lite" | "vizspec";
  notes: string | null;
}

/** Full query result from API */
export interface QueryResult {
  success: boolean;
  sql?: string;
  params?: Record<string, unknown>;
  rationale?: string;
  rows?: Array<Record<string, unknown>>;
  fields?: string[];
  chart?: ChartResponse;
  modified?: {
    sqlChanged: boolean;
    vizChanged: boolean;
  };
  error?: string;
}

/** Color theme preset names */
export type ColorPreset = "default" | "sunset" | "emerald" | "ocean";

/** Theme color configuration */
export interface ThemeColors {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  range: string[];
  text: string;
  muted: string;
  grid: string;
  background: string;
  surface: string;
  border: string;
  error: string;
}

/** Full theme configuration */
export interface Theme {
  name: string;
  colors: ThemeColors;
  borderRadius: string;
  fontFamily: string;
}

/** Provider configuration */
export interface QueryPanelConfig {
  /** API endpoint for ask queries */
  askEndpoint: string;
  /** API endpoint for chart modifications */
  modifyEndpoint?: string;
  /** Default color preset */
  colorPreset?: ColorPreset;
  /** Custom theme override */
  theme?: Partial<Theme>;
  /** Custom fetch function for API calls */
  fetcher?: (url: string, options: RequestInit) => Promise<Response>;
}

/** Prompt chip configuration */
export interface PromptChip {
  text: string;
  key: string;
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
}
