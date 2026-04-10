#!/usr/bin/env bun
/**
 * Generate RSA key pair and SQL insert statement for public_keys table
 *
 * Usage:
 *   bun run scripts/generate-public-key-sql.ts
 */

import { generateKeyPairSync } from "node:crypto";

const ORGANIZATION_ID = "23011c66-b1dd-40f3-bc88-4065c6357d39";
const KEY_NAME = "myOrg_default_key";
const KEY_TYPE = "RS256";

// Generate RSA key pair
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	publicKeyEncoding: {
		type: "spki",
		format: "pem",
	},
	privateKeyEncoding: {
		type: "pkcs8",
		format: "pem",
	},
});

// Escape single quotes for SQL
const escapedPublicKey = publicKey.replace(/'/g, "''");

// Generate SQL INSERT statement
const sql = `-- Insert public key for organization: ${ORGANIZATION_ID}
INSERT INTO public_keys (organization_id, name, public_key, key_type, is_active)
VALUES (
  '${ORGANIZATION_ID}',
  '${KEY_NAME}',
  '${escapedPublicKey}',
  '${KEY_TYPE}',
  true
);`;

console.log("=".repeat(80));
console.log("GENERATED RSA KEY PAIR");
console.log("=".repeat(80));
console.log("\n📋 SQL INSERT STATEMENT:\n");
console.log(sql);
console.log("\n" + "=".repeat(80));
console.log("🔑 PRIVATE KEY (Save this securely!):");
console.log("=".repeat(80));
console.log(privateKey);
console.log("=".repeat(80));
console.log("🔓 PUBLIC KEY:");
console.log("=".repeat(80));
console.log(publicKey);
console.log("=".repeat(80));
console.log("\n✅ Next steps:");
console.log("1. Run the SQL INSERT statement in your Supabase database");
console.log("2. Save the PRIVATE KEY to a secure location (e.g., .env file)");
console.log(
	"3. Use the private key with generate-token.ts to create JWT tokens",
);
console.log("\nExample .env entry:");
console.log(`JWT_PRIVATE_KEY="${privateKey.replace(/\n/g, "\\n")}"`);
