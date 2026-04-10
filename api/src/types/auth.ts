import type { JWTPayload } from "jose";

/**
 * JWT claims extended with custom fields
 */
export type AuthClaims = JWTPayload & {
	organizationId?: string;
	tenantId?: string;
	userId?: string;
	scope?: string | string[];
	scopes?: string[];
	permissions?: string[];
	role?: string | string[];
	roles?: string[];
};

/**
 * Authentication context attached to request
 * Access via c.get('auth') in Hono handlers
 */
export interface AuthContext {
	method?: "jwt" | "apikey";
	organizationId?: string;
	tenantId?: string;
	userId?: string;
	claims?: AuthClaims;
	scopes: string[];
	roles: string[];
}
