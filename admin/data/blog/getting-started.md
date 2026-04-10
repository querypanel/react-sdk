---
title: "Getting Started with QueryPanel: Your First Natural Language Query"
description: "Quick start guide: Install QueryPanel SDK, connect PostgreSQL or ClickHouse database, and run your first natural language to SQL query in minutes. Tutorial for developers building AI-powered analytics."
date: "2026-01-10"
authors: ["Csaba Ivancza"]
tags: ["tutorial", "getting-started", "sql", "natural language to SQL", "PostgreSQL", "ClickHouse", "SDK integration"]
keywords: ["QueryPanel tutorial", "natural language to SQL", "text to SQL", "PostgreSQL SDK", "ClickHouse SDK", "SQL generation", "AI SQL", "database query SDK", "analytics SDK", "quick start guide", "React SDK", "UI components", "QueryPanel setup"]
---

# Getting Started with QueryPanel

**Topic**: QueryPanel tutorial, natural language to SQL, SQL generation, SDK integration, PostgreSQL SDK, ClickHouse SDK, text to SQL, AI SQL, React SDK, UI components.

**Keywords**: QueryPanel, natural language to SQL, text to SQL, SQL generation, PostgreSQL SDK, ClickHouse SDK, SDK integration, AI SQL, database query SDK, analytics SDK, tutorial, quick start, getting started, SQL SDK, React SDK, QueryPanelProvider, QueryInput, QueryResult.

QueryPanel makes it easy to add natural language to SQL capabilities to your application. QueryPanel is a server-side SDK that converts natural language questions into SQL queries for PostgreSQL and ClickHouse databases. In this comprehensive guide, we'll walk through setting up QueryPanel from scratch, connecting your database, running your first query, and building a user interface using the React SDK.

## What is QueryPanel?

QueryPanel is a natural language to SQL SDK designed for multi-tenant SaaS applications. It enables developers to build AI-powered analytics features where users can ask questions in plain English and receive SQL query results with automatic chart generation. The SDK uses a zero-trust callback architecture, ensuring your database credentials and data never leave your infrastructure.

Key features:
- **Natural language to SQL conversion** - Ask questions in plain English
- **Multi-tenant support** - Built-in tenant isolation for SaaS applications
- **Automatic chart generation** - Returns Vega-Lite specifications for data visualization
- **Zero-trust security** - Credentials and data stay on your servers
- **PostgreSQL and ClickHouse support** - Works with popular database systems
- **React UI components** - Pre-built components for rapid UI development

## Installation

### Server-Side SDK

First, install the QueryPanel Node.js SDK for server-side SQL generation:

```bash
npm install @querypanel/node-sdk
```

The `@querypanel/node-sdk` package provides the core functionality for connecting to QueryPanel Cloud, managing database connections, and executing queries. This SDK must run in a Node.js environment (not in the browser) as it uses Node.js built-ins like `crypto` for JWT signing.

### React UI Components (Optional)

For building user interfaces quickly, install the React SDK:

```bash
npm install @querypanel/react-sdk
```

The `@querypanel/react-sdk` package provides pre-built React components like `QueryInput`, `QueryResult`, and `QueryPanelProvider` that make it easy to build analytics dashboards. We'll cover this later in the guide.

## Setting Up Your Environment

Before you begin, you'll need:

1. **QueryPanel API URL** - Your QueryPanel Cloud API endpoint
2. **Private Key** - A JWT private key for signing requests (RSA, EC, or Ed25519)
3. **Organization ID** - Your QueryPanel organization identifier

Set these as environment variables:

```bash
QUERYPANEL_API_URL=https://api.querypanel.com
MY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
ORGANIZATION_ID=your-org-id
```

## Initializing the SDK

Create a new QueryPanel SDK instance with your credentials:

```typescript
import { QueryPanelSdkAPI } from '@querypanel/node-sdk';

const sdk = new QueryPanelSdkAPI(
  process.env.QUERYPANEL_API_URL!,
  process.env.MY_PRIVATE_KEY!,
  process.env.ORGANIZATION_ID!,
  {
    defaultTenantId: process.env.DEFAULT_TENANT_ID, // Optional: default tenant for queries
  }
);
```

The SDK constructor takes three required parameters:
- **API URL**: Your QueryPanel Cloud API endpoint
- **Private Key**: Your JWT private key for authentication
- **Organization ID**: Your organization identifier

The optional configuration object can include a `defaultTenantId` for multi-tenant applications.

## Connecting Your Database

QueryPanel uses a callback pattern where you provide a function that executes SQL queries. This ensures your database credentials never leave your infrastructure.

### PostgreSQL Setup

For PostgreSQL databases, create a callback function that uses your existing database client:

```typescript
import { PostgresClientFn } from '@querypanel/node-sdk';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function createPostgresClientFn(): PostgresClientFn {
  return async (sql: string, params?: unknown[]) => {
    const result = await pool.query(sql, params);
    return {
      rows: result.rows,
      fields: result.fields.map(f => ({ name: f.name })),
    };
  };
}

// Attach the database to the SDK
sdk.attachPostgres('analytics', createPostgresClientFn(), {
  database: 'analytics_db',
  description: 'Analytics database with customer data',
  tenantFieldName: 'tenant_id',
  enforceTenantIsolation: true,
  allowedTables: ['orders', 'customers', 'products'],
});
```

The `attachPostgres` method takes three parameters:
1. **Database identifier** - A unique name for this database connection
2. **Callback function** - Your `PostgresClientFn` that executes SQL
3. **Configuration object** with:
   - `database`: Database name
   - `description`: Human-readable description
   - `tenantFieldName`: Column name for tenant isolation (required for multi-tenant apps)
   - `enforceTenantIsolation`: Automatically filter queries by tenant
   - `allowedTables`: Whitelist of tables accessible to QueryPanel

### ClickHouse Setup

For ClickHouse databases, the setup is similar:

```typescript
import { ClickHouseClient } from '@clickhouse/client';

const clickhouse = new ClickHouseClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
});

sdk.attachClickHouse('analytics', async (params) => {
  const result = await clickhouse.query(params);
  return result;
}, {
  database: 'analytics',
  tenantFieldName: 'customer_id',
  tenantFieldType: 'String',
});
```

## Syncing Schema Metadata

Before you can query your database, you need to sync schema metadata to QueryPanel Cloud. This tells QueryPanel about your table structures, column types, and relationships.

```typescript
await sdk.syncSchema('analytics', { tenantId: 'customer_123' });
```

The `syncSchema` method extracts metadata about your database schema and sends it to QueryPanel Cloud. This metadata includes:
- Table names and columns
- Data types for each column
- Foreign key relationships
- Custom annotations and glossary terms (if configured)

**Important**: Only schema metadata is sent to QueryPanel Cloud. Your actual data, credentials, and query results never leave your infrastructure.

The SDK is smart about syncing - it only re-syncs when schema changes are detected, avoiding unnecessary API calls.

## Your First Query

Now you're ready to run your first natural language query:

```typescript
const result = await sdk.ask(
  "Show me revenue by month for the last 6 months",
  {
    database: 'analytics',
    tenantId: 'customer_123',
  }
);

console.log(result.sql);              // Generated SQL query
console.log(result.rows);             // Query results as array of objects
console.log(result.chart.vegaLiteSpec); // Vega-Lite chart specification
```

The `ask` method returns a `QueryResult` object containing:
- **`sql`**: The generated SQL query string
- **`params`**: Parameterized query parameters (for safety)
- **`rows`**: Query results as an array of objects
- **`fields`**: Field metadata (names, types)
- **`chart`**: Visualization specification with Vega-Lite spec

QueryPanel automatically:
- Generates optimized SQL based on your schema
- Validates the query against your schema
- Applies tenant filtering if `enforceTenantIsolation` is enabled
- Suggests appropriate chart types based on your data
- Returns both the data and visualization specification

## Building a User Interface with React SDK

The `@querypanel/react-sdk` package provides pre-built React components for building analytics dashboards quickly. This eliminates the need to build query input forms, result tables, and chart rendering from scratch.

### Setting Up the Provider

Wrap your application with the `QueryPanelProvider`:

```typescript
import {
  QueryPanelProvider,
  QueryInput,
  QueryResult,
  useQueryPanel,
} from '@querypanel/react-sdk';

function App() {
  return (
    <QueryPanelProvider
      config={{
        askEndpoint: '/api/ask',
        modifyEndpoint: '/api/modify',
        colorPreset: 'default', // or 'sunset', 'emerald', 'ocean'
      }}
    >
      <Dashboard />
    </QueryPanelProvider>
  );
}
```

The provider requires API endpoints that handle query requests. These endpoints should use the Node.js SDK we set up earlier.

### Creating API Endpoints

Create Next.js API routes (or Express endpoints) that use the Node.js SDK:

```typescript
// app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { QueryPanelSdkAPI, PostgresClientFn } from '@querypanel/node-sdk';

export const runtime = 'nodejs';

let sdk: QueryPanelSdkAPI | null = null;

function getSdk() {
  if (!sdk) {
    sdk = new QueryPanelSdkAPI(
      process.env.QUERYPANEL_API_URL!,
      process.env.MY_PRIVATE_KEY!,
      process.env.ORGANIZATION_ID!
    );
    
    sdk.attachPostgres('analytics', createPostgresClientFn(), {
      database: 'analytics_db',
      tenantFieldName: 'tenant_id',
      enforceTenantIsolation: true,
    });
  }
  return sdk;
}

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();
    const sdkInstance = getSdk();
    
    await sdkInstance.syncSchema('analytics', { tenantId: 'customer_123' });
    
    const result = await sdkInstance.ask(question, {
      database: 'analytics',
      tenantId: 'customer_123',
    });
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

### Using React Components

Now you can use the React components in your dashboard:

```typescript
function Dashboard() {
  const { query, result, isLoading, error, ask, modify } = useQueryPanel();

  return (
    <div className="dashboard">
      <QueryInput
        onSubmit={ask}
        isLoading={isLoading}
        placeholder="Ask a question about your data..."
        chips={[
          { key: 'sales', text: 'Show sales by month', emoji: '📈' },
          { key: 'top', text: 'Top 10 products', emoji: '🏆' },
        ]}
      />
      
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {result && (
        <QueryResult
          result={result}
          query={query}
          onModify={modify}
        />
      )}
    </div>
  );
}
```

The React SDK provides these components:
- **`QueryInput`**: Search input with prompt chips for quick queries
- **`QueryResult`**: Combined display of chart, SQL, and data table
- **`VegaChart`**: Renders Vega-Lite specifications
- **`DataTable`**: Styled results table
- **`LoadingState`**, **`EmptyState`**, **`ErrorState`**: UI states

All components are fully customizable with theme presets and custom colors for white-labeling.

### Exploring React Components

To see all available React components in action, check out our hosted Storybook at [storybook.querypanel.io](https://storybook.querypanel.io). The Storybook provides:
- Interactive examples of all components
- Live previews with different configurations
- Theme and styling options
- Code snippets for each component
- Props documentation and examples

This is the best way to explore the React SDK before integrating it into your application.

## Next Steps

Now that you have QueryPanel set up, explore these topics:

- Learn about [zero-trust architecture and security](/blog/zero-trust-sdk-architecture) - Understand how QueryPanel keeps your data secure
- Discover [building dashboards](/blog/building-dashboards) - Learn about automatic chart generation with Vega-Lite
- Check out the [Node.js SDK documentation](https://www.npmjs.com/package/@querypanel/node-sdk) - Full API reference and examples
- Browse the [React SDK documentation](https://www.npmjs.com/package/@querypanel/react-sdk) - Component API and theming guides
- Explore components in [Storybook](https://storybook.querypanel.io) - Interactive component playground and examples

QueryPanel makes it easy to add AI-powered analytics to your application. With just a few lines of code, you can enable natural language queries, automatic SQL generation, and beautiful data visualizations - all while keeping your data secure on your infrastructure.
