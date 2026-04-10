import type { Context, MiddlewareHandler } from "hono";
import { decodeJwt, importJWK, importPKCS8, importSPKI, jwtVerify } from "jose";
import { config } from "../config";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import type { AuthClaims, AuthContext } from "../types/auth";

/**
 * Fetches active public keys for an organization from Supabase
 */
async function getActiveOrgPublicKeys(
	organizationId: string,
): Promise<string[]> {
	const { data, error } = await supabase
		.from("public_keys")
		.select("public_key")
		.eq("organization_id", organizationId)
		.eq("is_active", true);

	if (error) throw error;
	return (data ?? []).map((r: { public_key: string }) => r.public_key);
}

/**
 * Imports a PEM or JWK key string into a jose KeyLike object
 */
async function importPKCS8orSPKI(pem: string) {
	const normalized = pem.trim();

	if (normalized.includes("BEGIN PUBLIC KEY")) {
		return await importSPKI(normalized, "RS256");
	}
	if (normalized.includes("BEGIN RSA PUBLIC KEY")) {
		return await importSPKI(normalized, "RS256");
	}
	if (
		normalized.includes("BEGIN PRIVATE KEY") ||
		normalized.includes("BEGIN RSA PRIVATE KEY")
	) {
		// Should not happen for public keys, but handle gracefully
		return await importPKCS8(normalized, "RS256");
	}

	// Assume raw key string might be JWK JSON
	try {
		const jwk = JSON.parse(normalized);
		if (jwk.kty && jwk.n && jwk.e) {
			return await importJWK(jwk, "RS256");
		}
	} catch {}

	// Fallback: treat as SPKI
	return await importSPKI(normalized, "RS256");
}

/**
 * Normalizes a value to a string array
 */
function normalizeToArray(value: unknown): string[] | undefined {
	if (value == null) return undefined;
	if (Array.isArray(value))
		return value.filter((v) => typeof v === "string") as string[];
	if (typeof value === "string") return [value];
	return undefined;
}

/**
 * Derives scopes from roles based on predefined role-to-scope mapping
 */
function deriveScopesFromRoles(roles: string[]): string[] {
	const map: Record<string, string[]> = {
		viewer: ["ask:use", "stats:read"],
		trainer: ["ask:use", "stats:read", "train:use"],
		admin: ["*"],
	};
	const derived = new Set<string>();
	for (const r of roles) {
		const s = map[r.toLowerCase()];
		if (s)
			s.forEach((x) => {
				derived.add(x);
			});
	}
	return Array.from(derived);
}

/**
 * Computes scopes and roles from JWT claims
 */
function computeScopesAndRoles(claims: AuthClaims): {
	scopes: string[];
	roles: string[];
} {
	const roles =
		normalizeToArray(claims.roles) ?? normalizeToArray(claims.role) ?? [];

	const explicitScopes: string[] = [
		...(normalizeToArray(claims.scopes) ?? []),
		...(normalizeToArray(claims.permissions) ?? []),
		...(typeof claims.scope === "string"
			? claims.scope.split(/\s+/).filter(Boolean)
			: (normalizeToArray(claims.scope) ?? [])),
	];

	const roleDerivedScopes = deriveScopesFromRoles(roles);

	const set = new Set<string>([...explicitScopes, ...roleDerivedScopes]);
	return { scopes: Array.from(set), roles };
}

/**
 * Hono middleware for authentication
 * - Supports JWT Bearer tokens and X-API-Key headers
 * - Stores auth context in c.set('auth', context)
 * - For tests, use createTestAuthMiddleware() from tests/helpers/auth.helper.ts
 */
export function authMiddleware(): MiddlewareHandler {
	return async (c: Context, next) => {
		// Public liveness for uptime monitors and load balancers (not a data leak: no org/tenant context).
		if (c.req.method === "GET" && c.req.path === "/healthz") {
			await next();
			return;
		}

		const authHeader = c.req.header("authorization");
		const apiKey = c.req.header("x-api-key");

		// Option 1: API Key (service-to-service)
		if (apiKey) {
			const serviceApiKey = config.auth.serviceApiKey;
			if (!serviceApiKey) {
				logger.warn(
					"SERVICE_API_KEY not configured but API key auth attempted",
				);
				return c.json({ error: "API key authentication not configured" }, 401);
			}
			if (apiKey !== serviceApiKey) {
				return c.json({ error: "Invalid API key" }, 401);
			}

			// For API key auth, extract organization_id and tenant_id from request
			let organizationId =
				c.req.header("x-organization-id")?.trim() || undefined;
			let tenantId = c.req.header("x-tenant-id")?.trim() || undefined;

			try {
				// Try query params next
				if (!organizationId) {
					organizationId = c.req.query("organization_id");
				}
				if (!tenantId) {
					tenantId = c.req.query("tenant_id");
				}
			} catch (err) {
				logger.debug("Could not extract org/tenant from request body/query");
			}

			const authContext: AuthContext = {
				method: "apikey",
				organizationId,
				tenantId,
				scopes: ["*"], // Full access for service key
				roles: ["admin"],
			};
			c.set("auth", authContext);
			await next();
			return;
		}

		// Option 2: JWT (existing SDK flow)
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return c.json(
				{
					error:
						"Missing authentication. Provide either Bearer token or X-API-Key header",
				},
				401,
			);
		}

		const token = authHeader.slice("Bearer ".length).trim();
		let decoded: AuthClaims;
		try {
			decoded = decodeJwt(token) as AuthClaims;
		} catch (err) {
			logger.error({ err }, "Failed to decode JWT");
			return c.json({ error: "Invalid token format" }, 401);
		}

		const organizationId = decoded.organizationId;
		if (!organizationId) {
			logger.error("organizationId is required in token");
			return c.json({ error: "organizationId is required in token" }, 401);
		}

		let publicKeys: string[] = [];
		try {
			publicKeys = await getActiveOrgPublicKeys(organizationId);
		} catch (e: any) {
			logger.error({ err: e }, "Failed to load public keys");
			return c.json({ error: "Auth backend error" }, 500);
		}

		if (publicKeys.length === 0) {
			return c.json({ error: "No active public keys for organization" }, 401);
		}

		let verifiedClaims: AuthClaims | null = null;
		let lastError: unknown;
		for (const pem of publicKeys) {
			try {
				const keyLike = await importPKCS8orSPKI(pem);
				const { payload } = await jwtVerify(token, keyLike, {
					algorithms: ["RS256"],
				});
				verifiedClaims = payload as AuthClaims;
				break;
			} catch (err) {
				lastError = err;
			}
		}

		if (!verifiedClaims) {
			logger.warn({ err: lastError }, "JWT verification failed for all keys");
			return c.json({ error: "Invalid token" }, 401);
		}

		if (verifiedClaims.organizationId !== organizationId) {
			return c.json({ error: "organizationId mismatch" }, 401);
		}

		const { scopes, roles } = computeScopesAndRoles(verifiedClaims);
		const authContext: AuthContext = {
			method: "jwt",
			organizationId,
			claims: verifiedClaims,
			scopes,
			roles,
		};

		if (typeof verifiedClaims.tenantId === "string") {
			authContext.tenantId = verifiedClaims.tenantId;
		}
		if (typeof verifiedClaims.userId === "string") {
			authContext.userId = verifiedClaims.userId;
		}

		c.set("auth", authContext);
		await next();
	};
}
