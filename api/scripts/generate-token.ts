#!/usr/bin/env bun

/**
 * Generate JWT bearer token for API authentication
 *
 * Usage:
 *   bun run scripts/generate-token.ts
 *
 * Or with custom claims:
 *   bun run scripts/generate-token.ts --userId=user123 --tenantId=tenant456 --scopes=read,write
 */

import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";

// Configuration
const ORGANIZATION_ID = "149c3cc2-7f9e-49d0-950d-9a84aa3dd76c";
const ALGORITHM = "RS256";

// Parse command line arguments
const args = process.argv.slice(2);
const parseArgs = () => {
	const parsed: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace(/^--/, "").split("=");
		if (key && value) {
			parsed[key] = value;
		}
	}
	return parsed;
};

const cliArgs = parseArgs();

// Default claims (can be overridden via CLI args)
const userId = cliArgs.userId || "dev-user";
const tenantId = cliArgs.tenantId || "3";
const scopes = cliArgs.scopes?.split(",") || ["read", "write", "admin"];
const roles = cliArgs.roles?.split(",") || ["admin"];
const expiresIn = cliArgs.expiresIn || "24h";

// Get private key from environment or use demo key
const PRIVATE_KEY = process.env.QP_JWT_PRIVATE_KEY;

async function generateToken() {
	try {
		const privateKey = createPrivateKey({
			key: PRIVATE_KEY!.replace(/\\n/g, "\n"),
			format: "pem",
			type: "pkcs8",
		});

		const parseExpiry = (exp: string): number => {
			const match = exp.match(/^(\d+)([smhd])$/);
			if (!match)
				throw new Error("Invalid expiry format. Use: 30s, 5m, 24h, 7d");

			const [, value, unit] = match;
			const multipliers: Record<string, number> = {
				s: 1,
				m: 60,
				h: 3600,
				d: 86400,
			};

			return Number.parseInt(value || "0") * (multipliers[unit || "s"] || 1);
		};

		const expirySeconds = parseExpiry(expiresIn);
		const now = Math.floor(Date.now() / 1000);
		const exp = now + expirySeconds;

		const jwt = await new SignJWT({
			organizationId: ORGANIZATION_ID,
			tenantId,
			userId,
			scopes,
			roles,
		})
			.setProtectedHeader({ alg: ALGORITHM })
			.setIssuedAt(now)
			.setExpirationTime(exp)
			.setIssuer("querypanel-api")
			.setAudience("querypanel-api")
			.sign(privateKey);

		console.log("=".repeat(80));
		console.log("JWT BEARER TOKEN GENERATED");
		console.log("=".repeat(80));
		console.log("\n📋 Token Claims:");
		console.log(
			JSON.stringify(
				{
					organizationId: ORGANIZATION_ID,
					tenantId,
					userId,
					scopes,
					roles,
					iat: now,
					exp,
					expiresIn: `${expirySeconds}s (${expiresIn})`,
					expiresAt: new Date(exp * 1000).toISOString(),
				},
				null,
				2,
			),
		);

		console.log("\n" + "=".repeat(80));
		console.log("🔑 JWT TOKEN:");
		console.log("=".repeat(80));
		console.log(jwt);

		console.log("\n" + "=".repeat(80));
		console.log("📤 Usage Examples:");
		console.log("=".repeat(80));
		console.log("\n1. cURL:");
		console.log(`curl -X POST http://localhost:3000/ingest \\
  -H "Authorization: Bearer ${jwt}" \\
  -H "Content-Type: application/json" \\
  -d '{"dialect": "postgres", "tables": [...]}'`);

		console.log("\n2. JavaScript fetch:");
		console.log(`fetch('http://localhost:3000/ingest', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${jwt}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ dialect: 'postgres', tables: [...] })
});`);

		console.log("\n" + "=".repeat(80));
		console.log("⚙️  Custom Token Generation:");
		console.log("=".repeat(80));
		console.log(
			"bun run scripts/generate-token.ts --userId=user123 --tenantId=tenant456 --scopes=read,write --expiresIn=7d",
		);
	} catch (error) {
		console.error("❌ Error generating token:", error);
		console.error("\n💡 Make sure to:");
		console.error(
			"1. Run generate-public-key-sql.ts first to create a key pair",
		);
		console.error(
			"2. Set JWT_PRIVATE_KEY environment variable with your private key",
		);
		console.error("3. Or update the PRIVATE_KEY constant in this script");
		process.exit(1);
	}
}

generateToken();
