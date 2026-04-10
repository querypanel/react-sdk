import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose/jwt/sign";
import { generateKeyPair } from "jose/key/generate/keypair";
import type { AuthContext } from "../../src/types/auth";

// Set up test environment variables
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.OPENAI_API_KEY = "sk-test";
process.env.SERVICE_API_KEY = "test-api-key-123";

// Store original NODE_ENV
const originalNodeEnv = process.env.NODE_ENV;

// Mock Supabase client
const mockSupabaseSelect = mock(() => ({
	eq: mock(() => ({
		eq: mock(() => ({
			data: null,
			error: null,
		})),
	})),
}));

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mock(() => ({
			select: mockSupabaseSelect,
		})),
	},
}));

mock.module("../../src/config", () => ({
	config: {
		get nodeEnv() {
			return process.env.NODE_ENV || "test";
		},
		supabase: {
			url: "https://test.supabase.co",
			serviceRoleKey: "test-service-role-key",
		},
		openai: {
			apiKey: "sk-test",
		},
		mastra: {
			databaseUrl: "postgresql://test:test@localhost:5432/test",
			postgresPoolMax: 5,
			postgresIdleTimeoutMillis: 5000,
		},
		models: {
			sqlGenerator: "gpt-4o-mini",
			chartGenerator: "gpt-4o-mini",
			guardrail: "gpt-4o-mini",
			moderation: "omni-moderation-latest",
		},
		autoEval: {
			enabled: false,
			sampleRate: 0.05,
			judgeModel: "gpt-4o-mini",
			timeoutMs: undefined,
		},
		database: {
			tableName: "schema_chunks",
			queryName: "match_documents",
		},
		auth: {
			serviceApiKey: "test-api-key-123",
		},
		langfuse: {
			publicKey: undefined,
			secretKey: undefined,
			host: undefined,
			enabled: false,
		},
	},
}));

// Import after mocking
import { authMiddleware } from "../../src/middleware/auth.middleware";

describe("authMiddleware", () => {
	let app: Hono;
	let publicKey: string;
	let privateKey: CryptoKey;

	beforeEach(async () => {
		// Reset NODE_ENV
		process.env.NODE_ENV = "test";

		// Generate RSA key pair for testing
		const keyPair = await generateKeyPair("RS256");
		privateKey = keyPair.privateKey;

		// Export public key to PEM format
		const exportedPublicKey = await crypto.subtle.exportKey(
			"spki",
			keyPair.publicKey,
		);
		const publicKeyPem = Buffer.from(exportedPublicKey).toString("base64");
		publicKey = `-----BEGIN PUBLIC KEY-----\n${publicKeyPem}\n-----END PUBLIC KEY-----`;

		// Setup test app
		app = new Hono();
		app.use("*", authMiddleware());
		app.get("/healthz", (c) =>
			c.json({ message: "OK", status: "healthy" }),
		);
		app.get("/test", (c) => {
			const auth = c.get("auth") as AuthContext;
			return c.json({ auth });
		});

		// Reset mocks
		mockSupabaseSelect.mockClear();
	});

	afterEach(() => {
		// Restore original NODE_ENV
		process.env.NODE_ENV = originalNodeEnv;
	});

	/**
	 * Note: Development mode bypass was removed from auth middleware
	 * Tests should use test helpers (createTestAuthMiddleware) or API key auth
	 * See tests/helpers/auth.helper.ts for test utilities
	 */

	describe("API Key authentication", () => {
		test("should authenticate with valid API key", async () => {
			const res = await app.request("/test", {
				method: "GET",
				headers: {
					"x-api-key": "test-api-key-123",
				},
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.auth).toEqual({
				method: "apikey",
				organizationId: undefined,
				tenantId: undefined,
				scopes: ["*"],
				roles: ["admin"],
			});
		});

		test("should reject invalid API key", async () => {
			const res = await app.request("/test", {
				method: "GET",
				headers: {
					"x-api-key": "wrong-key",
				},
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe("Invalid API key");
		});
	});

	describe("JWT authentication", () => {
		test("GET /healthz is allowed without authentication", async () => {
			const res = await app.request("/healthz", { method: "GET" });
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.status).toBe("healthy");
		});

		test("should reject missing authorization header", async () => {
			const res = await app.request("/test", {
				method: "GET",
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toContain("Missing authentication");
		});

		test("should reject malformed authorization header", async () => {
			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: "NotBearer token",
				},
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toContain("Missing authentication");
		});

		test("should reject invalid JWT format", async () => {
			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: "Bearer invalid.jwt.token",
				},
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe("Invalid token format");
		});

		test("should reject JWT without organizationId", async () => {
			const token = await new SignJWT({ userId: "user-123" })
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe("organizationId is required in token");
		});

		test("should reject JWT when no public keys available", async () => {
			// Mock no public keys
			mockSupabaseSelect.mockReturnValue({
				eq: mock(() => ({
					eq: mock(() => ({
						data: [],
						error: null,
					})),
				})),
			});

			const token = await new SignJWT({
				organizationId: "org-123",
				userId: "user-123",
			})
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe("No active public keys for organization");
		});

		test("should authenticate with valid JWT and extract claims", async () => {
			// Mock public key retrieval
			mockSupabaseSelect.mockReturnValue({
				eq: mock(() => ({
					eq: mock(() => ({
						data: [{ public_key: publicKey }],
						error: null,
					})),
				})),
			});

			const token = await new SignJWT({
				organizationId: "org-123",
				tenantId: "tenant-456",
				userId: "user-789",
				roles: ["viewer"],
				scopes: ["custom:scope"],
			})
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.auth.method).toBe("jwt");
			expect(json.auth.organizationId).toBe("org-123");
			expect(json.auth.tenantId).toBe("tenant-456");
			expect(json.auth.userId).toBe("user-789");
			expect(json.auth.roles).toEqual(["viewer"]);
			expect(json.auth.scopes).toContain("custom:scope");
			expect(json.auth.scopes).toContain("ask:use"); // derived from viewer role
			expect(json.auth.scopes).toContain("stats:read"); // derived from viewer role
		});

		test("should derive scopes from admin role", async () => {
			mockSupabaseSelect.mockReturnValue({
				eq: mock(() => ({
					eq: mock(() => ({
						data: [{ public_key: publicKey }],
						error: null,
					})),
				})),
			});

			const token = await new SignJWT({
				organizationId: "org-123",
				userId: "user-789",
				roles: ["admin"],
			})
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.auth.scopes).toContain("*");
		});

		test("should handle scope as space-separated string", async () => {
			mockSupabaseSelect.mockReturnValue({
				eq: mock(() => ({
					eq: mock(() => ({
						data: [{ public_key: publicKey }],
						error: null,
					})),
				})),
			});

			const token = await new SignJWT({
				organizationId: "org-123",
				userId: "user-789",
				scope: "read:data write:data delete:data",
			})
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.auth.scopes).toContain("read:data");
			expect(json.auth.scopes).toContain("write:data");
			expect(json.auth.scopes).toContain("delete:data");
		});
	});

	describe("Error handling", () => {
		test("should handle Supabase errors gracefully", async () => {
			mockSupabaseSelect.mockReturnValue({
				eq: mock(() => ({
					eq: mock(() => ({
						data: null,
						error: new Error("Database error"),
					})),
				})),
			});

			const token = await new SignJWT({
				organizationId: "org-123",
				userId: "user-789",
			})
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(privateKey);

			const res = await app.request("/test", {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Auth backend error");
		});
	});
});
