// Components
export { VegaChart, type VegaChartProps } from "./components/VegaChart";
export { DataTable, type DataTableProps } from "./components/DataTable";
export { ChartControls, type ChartControlsProps } from "./components/ChartControls";
export { QueryInput, type QueryInputProps } from "./components/QueryInput";
export { QueryResult, type QueryResultProps } from "./components/QueryResult";
export { LoadingState, type LoadingStateProps } from "./components/LoadingState";
export { ErrorState, type ErrorStateProps } from "./components/ErrorState";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState";

// Context & Hooks
export {
  QueryPanelProvider,
  useQueryPanel,
  type QueryPanelProviderProps,
} from "./context/QueryPanelContext";

// Types
export type {
  VisualizationSpec,
  ChartType,
  TimeUnit,
  SqlModifications,
  VizModifications,
  ChartResponse,
  QueryResult as QueryResultType,
  ColorPreset,
  ThemeColors,
  Theme,
  QueryPanelConfig,
  PromptChip,
} from "./types";

// Themes
export {
  defaultTheme,
  defaultColors,
  sunsetColors,
  emeraldColors,
  oceanColors,
  getColorsByPreset,
  createTheme,
} from "./themes";
