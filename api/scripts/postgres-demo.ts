import "dotenv/config";
import pg from "pg";
import {
	type AskResponse,
	type PostgresClientFn,
	QueryPanelSdkAPI,
} from "@querypanel/node-sdk";

const { Pool } = pg;

// PostgreSQL connection configuration
const pool = new Pool({
	host: "localhost",
	port: 5433,
	database: "pg_demo",
	user: "demo",
	password: "demo123",
});

async function seed() {
	const client = await pool.connect();
	try {
		// Drop and recreate the orders table
		await client.query(`DROP TABLE IF EXISTS orders`);
		await client.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `);

		// Drop and recreate the users table (this will NOT be in allowedTables)
		await client.query(`DROP TABLE IF EXISTS users`);
		await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `);

		// Insert 50 orders
		const tenants = ["tenant_a", "tenant_b"];
		const orderValues: string[] = [];

		for (let i = 1; i <= 50; i += 1) {
			const tenant = tenants[i % tenants.length];
			const userId = `user_${(i % 10) + 1}`;
			const amount = (Math.random() * 1000 + 10).toFixed(2);
			const date = new Date(
				Date.now() - Math.floor(Math.random() * 30) * 86400000,
			).toISOString();
			orderValues.push(`('${tenant}', '${userId}', ${amount}, '${date}')`);
		}

		await client.query(
			`INSERT INTO orders (tenant_id, user_id, amount, created_at) VALUES ${orderValues.join(",")}`,
		);

		// Insert 20 users
		const userValues: string[] = [];
		for (let i = 1; i <= 20; i += 1) {
			const tenant = tenants[i % tenants.length];
			const email = `user${i}@example.com`;
			const name = `User ${i}`;
			const date = new Date(
				Date.now() - Math.floor(Math.random() * 30) * 86400000,
			).toISOString();
			userValues.push(`('${tenant}', '${email}', '${name}', '${date}')`);
		}

		await client.query(
			`INSERT INTO users (tenant_id, email, name, created_at) VALUES ${userValues.join(",")}`,
		);

		console.log("✅ Seeded 50 orders and 20 users into PostgreSQL");
		console.log(
			"   Note: Only 'orders' table will be synced (users is excluded via allowedTables)",
		);
	} finally {
		client.release();
	}
}

// Create a PostgresClientFn for the SDK
// This function signature matches what PostgresAdapter expects
const createPostgresClientFn = (): PostgresClientFn => {
	return async (sql: string, params?: unknown[]) => {
		const client = await pool.connect();
		try {
			const result = await client.query(sql, params);
			return {
				rows: result.rows as Array<Record<string, unknown>>,
				fields: result.fields.map((f: { name: string }) => ({ name: f.name })),
			};
		} finally {
			client.release();
		}
	};
};

// Helper to safely get error message
function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

async function main() {
	console.log("🚀 PostgreSQL Demo for QueryPanel SDK\n");

	// Check if PostgreSQL is running
	try {
		const client = await pool.connect();
		client.release();
		console.log("✅ Connected to PostgreSQL on localhost:5433");
	} catch (error) {
		console.error(
			"❌ Failed to connect to PostgreSQL. Make sure Docker is running:",
		);
		console.error("   docker-compose up demo_db -d\n");
		throw error;
	}

	// Seed the database
	await seed();

	const baseUrl = "http://localhost:3001";
	const privateKey =
		"-----BEGIN PRIVATE KEY-----\n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\nbKAhGPeXR7C8RGog+i0BcqmVCrFJeg==\n-----END PRIVATE KEY-----\n";
	const workspaceId = "5fd711f9-3159-459a-892f-86b05b55dae2";
	const tenantId = "tenant_a";

	const qp = new QueryPanelSdkAPI(baseUrl, privateKey, workspaceId, {
		defaultTenantId: tenantId,
	});

	// Attach PostgreSQL database using the SDK's PostgresAdapter
	// The SDK will automatically handle tenant isolation when tenantFieldName is provided
	qp.attachPostgres("pg_demo", createPostgresClientFn(), {
		database: "pg_demo",
		description: "PostgreSQL demo database",
		tenantFieldName: "tenant_id", // SDK will automatically filter by tenant_id
		enforceTenantIsolation: true, // Ensures all queries include tenant_id filter
		allowedTables: ["orders"], // Only sync 'orders' table - 'users' will be excluded
	});

	// Optional ClickHouse attachment (uncomment if you have one handy)
	// qp.attachClickhouse(
	//   "analytics",
	//   (params) => clickhouse.query(params),
	//   {
	//     database: "analytics",
	//     tenantFieldName: "customer_id",
	//     tenantFieldType: "String",
	//   },
	// );

	// Run a local query directly using the PostgreSQL client
	console.log("\n📊 Running local query:");
	try {
		const clientFn = createPostgresClientFn();
		const localResult = await clientFn(
			"SELECT SUM(amount) AS total_revenue FROM orders WHERE tenant_id = $1",
			[tenantId],
		);
		console.table(localResult.rows);
	} catch (error) {
		console.warn(`⚠️  Local query failed: ${getErrorMessage(error)}`);
	}

	// Sync schema with QueryPanel API (optional - SDK will auto-sync on ask() unless disabled)
	try {
		console.log("\n🔄 Syncing schema with QueryPanel API...");
		const syncResult = await qp.syncSchema("pg_demo", { tenantId });
		if (syncResult.skipped) {
			console.log("ℹ️  Schema unchanged; skipping ingestion");
		} else {
			console.log(
				`✅ Schema synced successfully (${syncResult.chunks} chunks created)`,
			);
		}
	} catch {
		console.warn(
			"\n⚠️  Schema sync failed (server may not be running). SDK will auto-sync on first ask().",
		);
		console.warn("   To enable full functionality, start the server:");
		console.warn("   bun run dev\n");
	}

	// Ask the AI to generate SQL
	// The SDK will automatically:
	// 1. Sync schema if not already synced (unless disableAutoSync: true)
	// 2. Add tenant_id filter to the SQL (because tenantFieldName is set)
	// 3. Execute the query and return results
	// 4. Generate a chart spec from the results
	try {
		console.log("\n🤖 Asking AI to generate SQL...");
		const res: AskResponse = await qp.ask("What is my total revenue?", {
			tenantId, // Can be omitted since defaultTenantId is set
			database: "pg_demo",
		});
		console.log("\n📝 Generated SQL:");
		console.log(res.sql);
		console.log("\n🧮 Parameters:");
		console.log(JSON.stringify(res.params, null, 2));
		if (res.rationale) {
			console.log("\n💭 Rationale:");
			console.log(res.rationale);
		}
		console.log("\n📊 Query Results:");
		console.table(res.rows);
		if (res.chart.vegaLiteSpec) {
			console.log("\n📈 Chart spec generated:");
			console.log(`   Mark: ${res.chart.vegaLiteSpec.mark || "N/A"}`);
			console.log(
				`   Encoding: ${Object.keys(res.chart.vegaLiteSpec.encoding || {}).join(", ")}`,
			);
		} else if (res.chart.notes) {
			console.log(`\n📝 Chart notes: ${res.chart.notes}`);
		}
		if (res.context && res.context.length > 0) {
			console.log(`\n🔗 Context used: ${res.context.length} document(s)`);
		}
	} catch (error) {
		console.warn(
			"\n⚠️  AI query generation failed (server may not be running):",
		);
		console.error(error);
		console.warn(`   ${getErrorMessage(error)}\n`);
	}

	console.log("\n✅ Demo complete!");
}

main()
	.catch((err) => {
		console.error("\n❌ Error:", err.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await pool.end();
	});
