# QueryPanel Bun API

QueryPanel's Bun/Hono service ingests database schemas, enriches them with knowledge annotations, turns natural language into validated SQL, and generates Vega-Lite chart specs. Supabase stores metadata, vectors, and dashboard state, while LangChain + OpenAI power the LLM flows.

## Quickstart

> Requires [Bun](https://bun.sh) ≥ 1.1, a Supabase project with the SQL extensions enabled, and OpenAI API access.

1. **Install dependencies**
   ```bash
   bun install
   ```
2. **Copy and edit your environment**
   ```bash
   cp .env.example .env
   ```
   Fill in the values shown in [Environment](#environment).
3. **Apply the Supabase migrations**
   ```bash
   supabase db push                      # or run the .sql files in supabase/migrations
   ```
   This creates `schema_chunks`, `table_schemas`, `schema_annotations`, `sql_logs`, `sdk_charts`, `sdk_active_charts`, and supporting tables/indexes.
4. **Start the API locally**
   ```bash
   bun run dev
   ```
   The server boots on `http://localhost:3000` with hot reload and development-only auth defaults.
5. **Run the automated tests (optional but recommended)**
   ```bash
   bun test
   ```

Once the server is running you can:
- `POST /ingest` to chunk schemas into embeddings.
- `POST /query` to turn a question into tenant-scoped SQL.
- `POST /chart` to convert SQL output schemas into Vega-Lite specs.
- Use `/v2/charts`, `/v2/active-charts`, and `/knowledge-base/*` to manage dashboards and context. Detailed guides live under [`docs/`](#feature-guides).

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Hono server with hot reload, structured logging, and relaxed auth (auto admin context). |
| `bun test` | Execute the Bun test runner across `tests/**/*`. Append a path to scope: `bun test tests/services/chunker.test.ts`. |
| `bun install` | Restore dependencies after cloning or updating `bun.lock`. |
| `bun run format` | Format the codebase via Biome (`biome format`). |
| `vercel` | (Optional) Deploy to Vercel once production env vars are configured. |

## Environment

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (https://xyz.supabase.co). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key; required for inserts/updates from the API. |
| `OPENAI_API_KEY` | Used by moderation, guardrail, SQL generation, and chart generation flows. |
| `MASTRA_DATABASE_URL` | Supabase Postgres connection string for Mastra storage/observability. Use a hosted connection, not local file storage, for Vercel deployments. If the password contains reserved URL characters such as `#` or `?`, percent-encode them first. |
| `SERVICE_API_KEY` | Optional S2S key. When set, requests with `X-API-Key` can skip JWT auth (see `docs/auth.md`). |
| `DB_TABLE_NAME` / `DB_QUERY_NAME` | Override the vector table/function names (`schema_chunks`/`match_documents` by default). |
| `NODE_ENV` | Controls dev-mode auth bypass and logger behavior (`development` by default). |
| `LOG_LEVEL` | Pino log level (`debug` default in dev). |

Never reference `process.env` directly outside `src/config`; use the Zod-validated `config` object instead.

## Project Layout

```
src/
  config/          # Typed env loader
  middleware/      # Authentication + authorization helpers
  routes/          # Hono route registrations (ingest, query, chart, KB, saved charts)
  schemas/         # Zod request/response validators
  services/        # Core business logic (chunking, embeddings, retrieval, charts, SQL, logging)
  lib/             # Shared helpers (logger, Supabase client)
  types/           # Shared TypeScript interfaces
supabase/migrations/  # SQL to keep Postgres + storage in sync
tests/                # Mirrors src/ for unit + integration coverage
docs/                 # Deep dives on auth, query flow, charting, dashboards, and KB
```

## Feature Guides

Each subsystem has its own playbook under `docs/`:
- `docs/auth.md` – headers, JWTs vs service keys, scopes, and troubleshooting.
- `docs/query-pipeline.md` – NL→SQL pipeline, repair loop, and SQL logging.
- `docs/chart.md` – `/chart` input contract, validation/repair loop, and best practices.
- `docs/save-charts.md` – CRUD for `/v2/charts` and how data is scoped per tenant.
- `docs/active-charts.md` – Ordering, pagination, and metadata for `/v2/active-charts`.
- `docs/knowledgebase.md` – Managing annotations plus `gold_sql`/`glossary` chunk uploads.

Start with those references whenever you need request payloads, response shapes, or operational tips.

## Deployment Checklist

1. Provision environment variables (`SUPABASE_*`, `OPENAI_API_KEY`, `SERVICE_API_KEY`) in your hosting provider (Vercel recommended).
2. Set `MASTRA_DATABASE_URL` to a Supabase Postgres connection string so Mastra storage does not rely on Vercel's ephemeral filesystem.
3. Confirm `supabase/migrations` have been applied to the target database and `schema_export.json` was regenerated if schemas changed.
4. Run `bun test` locally and ensure `bun run dev` boots without errors.
5. Deploy with `vercel` (or your preferred platform) and smoke test the critical endpoints (`/ingest`, `/query`, `/chart`) plus the Mastra endpoints under `/api`.

The service is stateless; scaling horizontally only requires consistent access to Supabase and the configured OpenAI project.
