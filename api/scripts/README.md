# QueryPanel SDK Demos

These demos show how to use the QueryPanel SDK with different databases.

## Prerequisites

- Docker installed and running
- Node.js 18+ installed

## PostgreSQL Demo

1. **Start PostgreSQL database:**
   ```bash
   docker-compose up demo_db -d
   ```

2. **Run the demo:**
   ```bash
   npm run demo:postgres
   ```

The demo will:
- ✅ Connect to PostgreSQL (localhost:5433)
- ✅ Create and seed an `orders` table with 50 sample records
- ✅ Run a local aggregation query
- ✅ Attempt to sync schema with QueryPanel API (requires server)
- ✅ Attempt AI-powered SQL generation (requires server)

### PostgreSQL Details

- **Host:** localhost
- **Port:** 5433
- **Database:** demo
- **User:** demo
- **Password:** demo123

### Cleanup

```bash
docker-compose down demo_db
docker volume rm querypanel-sdk_demo_db_data
```

## ClickHouse Demo

1. **Start ClickHouse database:**
   ```bash
   docker-compose up clickhouse_demo -d
   ```

2. **Run the demo:**
   ```bash
   npm run demo:clickhouse
   ```

The demo will:
- ✅ Connect to ClickHouse (localhost:8123)
- ✅ Create and seed an `orders` table with 50 sample records
- ✅ Run a local aggregation query
- ✅ Attempt to sync schema with QueryPanel API (requires server)
- ✅ Attempt AI-powered SQL generation (requires server)

### ClickHouse Details

- **Host:** localhost
- **HTTP Port:** 8123
- **Native Port:** 9000
- **Database:** demo
- **User:** demo
- **Password:** demo123

### Cleanup

```bash
docker-compose down clickhouse_demo
docker volume rm querypanel-sdk_clickhouse_data
```

## Full Functionality

To enable schema sync and AI-powered SQL generation for both demos, start the QueryPanel API server:

```bash
npm run dev
```

Then run either demo again to see the full capabilities.

