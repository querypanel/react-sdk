# @querypanel/react-sdk

`@querypanel/react-sdk` is the headful React SDK for [QueryPanel](https://querypanel.io) embedded analytics. It renders multi-tenant, customer-facing dashboards inside your React app (React 18 or 19) as normal components, not an iframe. The main component, `QuerypanelEmbedded`, loads a deployed dashboard into a block-based (Notion-like) editor with a built-in AI assistant: your customers ask questions in plain language, QueryPanel turns them into SQL (natural-language-to-SQL) against your Postgres, ClickHouse, or BigQuery data, and each tenant can customize its own copy of the dashboard. Tenant scoping comes from a JWT you mint on your server.

- Docs: [querypanel.io/docs/react-sdk](https://querypanel.io/docs/react-sdk)
- Tenant isolation: [querypanel.io/docs/tenant-isolation](https://querypanel.io/docs/tenant-isolation)
- JWT setup: [querypanel.io/docs/jwt](https://querypanel.io/docs/jwt)
- Why native React instead of an iframe: [iframe vs native React embedded analytics (2026)](https://querypanel.io/blog/iframe-vs-native-react-embedded-analytics-2026)

## When to use the React SDK vs the Node SDK

- **React SDK (this package, headful):** start here if you want ready-made dashboards, an AI assistant, and per-tenant customization in your React UI. Your server still mints the tenant JWT.
- **[Node SDK](https://www.npmjs.com/package/@querypanel/node-sdk) (headless):** use `@querypanel/node-sdk` on your server to mint JWTs, sync your database schema, and call `ask()` from your own API routes. Choose it alone when you want to build your own UI on top of natural-language-to-SQL results; SQL runs against your database from your server.

Most React apps use both: the Node SDK on the server, `QuerypanelEmbedded` in the browser.

How it compares to other embedded analytics tools: [querypanel.io/compare](https://querypanel.io/compare).

## Installation

```bash
npm install @querypanel/react-sdk
# or
yarn add @querypanel/react-sdk
# or
pnpm add @querypanel/react-sdk
```

## Quick Start

### Using the Provider (Recommended)

```tsx
import {
  QueryPanelProvider,
  QueryInput,
  QueryResult,
  LoadingState,
  EmptyState,
  ErrorState,
  useQueryPanel,
} from "@querypanel/react-sdk";

function App() {
  return (
    <QueryPanelProvider
      config={{
        askEndpoint: "/api/demo/ask",
        modifyEndpoint: "/api/demo/modify",
        colorPreset: "default",
      }}
    >
      <Dashboard />
    </QueryPanelProvider>
  );
}

function Dashboard() {
  const { query, result, isLoading, error, ask, modify, colorPreset } = useQueryPanel();

  return (
    <div>
      <QueryInput
        value={query}
        onSubmit={ask}
        isLoading={isLoading}
        chips={[
          { key: "sales", text: "Show sales by month", emoji: "📈" },
          { key: "top", text: "Top 10 products", emoji: "🏆" },
        ]}
      />

      {isLoading && !result && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!isLoading && !error && !result && <EmptyState />}
      {result && (
        <QueryResult
          result={result}
          query={query}
          isLoading={isLoading}
          colorPreset={colorPreset}
          onModify={modify}
        />
      )}
    </div>
  );
}
```

### Using Individual Components

```tsx
import { VizSpecRenderer, DataTable, ChartControls } from "@querypanel/react-sdk";
import { getColorsByPreset } from "@querypanel/react-sdk/themes";

function MyChart({ spec, data, fields }) {
  const colors = getColorsByPreset("ocean");

  return (
    <div>
      <ChartControls
        fields={fields}
        onApply={(options) => console.log(options)}
      />
      <VizSpecRenderer spec={spec} data={data} colors={colors} />
      <DataTable rows={data} fields={fields} />
    </div>
  );
}
```

## Components

### `QuerypanelEmbedded`
Embeds a deployed dashboard by calling the **QueryPanel API** from the browser. Set `apiBaseUrl` to the same QueryPanel API base URL you use with the Node SDK (e.g. `https://api.querypanel.io` or your region/self-hosted host). Authenticate with a **JWT** you mint on your server (RS256) — never ship your workspace private key to the client.

```tsx
import { QuerypanelEmbedded } from "@querypanel/react-sdk";

function CustomerPage() {
  return (
    <QuerypanelEmbedded
      dashboardId="3ed3b98f-..."
      apiBaseUrl="https://api.querypanel.io"
      jwt={tenantJwtFromYourServer}
      allowCustomization={true}
    />
  );
}
```

Notes:
- The embed sends `Authorization: Bearer <jwt>` to `apiBaseUrl` (QueryPanel API).
- Mint the JWT with the Node SDK (`createJwt`, etc.) on your server; pass only the JWT to the client.
- The old `token` prop was removed in favor of `jwt`.

### `QueryInput`
Search input with prompt chips for quick queries.

### `VizSpecRenderer`
Renders a VizSpec (chart, table, or metric) with the given data and theme colors. `VizSpecChart`, `VizSpecTable`, and `VizSpecMetric` render each kind directly.

### `DataTable`
Displays query results in a styled table.

### `ChartControls`
Controls for modifying chart type, axes, time granularity, and colors.

### `QueryResult`
Combined display of chart, SQL, and data table.

### `DashboardViewer`, `DashboardEditor`, `DashboardAiEditor`
Lower-level dashboard building blocks. `QuerypanelEmbedded` uses `DashboardAiEditor` (block editor plus AI chart assistant) internally.

### `LoadingState`, `ErrorState`, `EmptyState`
UI states for loading, errors, and empty results.

## Theming

### Color Presets

Built-in presets: `default`, `sunset`, `emerald`, `ocean`

```tsx
import { getColorsByPreset } from "@querypanel/react-sdk/themes";

const colors = getColorsByPreset("sunset");
```

### Custom Theme

```tsx
import { createTheme } from "@querypanel/react-sdk/themes";

const customTheme = createTheme({
  colors: {
    primary: "#FF6B6B",
    secondary: "#4ECDC4",
    // ... other colors
  },
  borderRadius: "1rem",
  fontFamily: "Inter, sans-serif",
});
```

## White-Labeling

Components accept a `colors` prop for custom styling (`ThemeColors`; some components, such as `DataTable` and `QueryResult`, also accept a partial object). Start from a preset and override what you need:

```tsx
import { VizSpecRenderer } from "@querypanel/react-sdk";
import { defaultColors } from "@querypanel/react-sdk/themes";

<VizSpecRenderer
  spec={spec}
  data={data}
  colors={{
    ...defaultColors,
    primary: "#YOUR_BRAND_COLOR",
    range: ["#color1", "#color2", "#color3"],
    text: "#ffffff",
    muted: "#888888",
  }}
/>
```

`QuerypanelEmbedded` also takes `colorPreset`, `theme`, `darkMode`, and `branding` props.

## Types

```typescript
interface ThemeColors {
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

// Exported as `QueryResultType`
interface QueryResult {
  success: boolean;
  sql?: string;
  params?: Record<string, unknown>;
  rationale?: string;
  rows?: Array<Record<string, unknown>>;
  fields?: string[];
  chart?: {
    vegaLiteSpec?: Record<string, unknown> | null;
    vizSpec?: Record<string, unknown> | null;
    specType: "vega-lite" | "vizspec";
    notes: string | null;
  };
  modified?: { sqlChanged: boolean; vizChanged: boolean };
  error?: string;
}
```

## License

MIT
