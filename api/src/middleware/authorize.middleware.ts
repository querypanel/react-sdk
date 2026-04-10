import type { Context, MiddlewareHandler } from "hono";
import type { AuthContext } from "../types/auth";

export interface AuthorizeOptions {
	anyScopes?: string[];
	allScopes?: string[];
	roles?: string[];
}

/**
 * Hono middleware for authorization
 * Checks if the authenticated user has the required scopes and/or roles
 *
 * Usage:
 * ```ts
 * app.post('/query', authorize({ anyScopes: ['ask:use'] }), async (c) => {
 *   // handler code
 * });
 * ```
 */
export function authorize(options: AuthorizeOptions): MiddlewareHandler {
	return async (c: Context, next) => {
		const auth = c.get("auth") as AuthContext | undefined;

		if (!auth) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const userScopes = new Set(auth.scopes);
		const userRoles = new Set(auth.roles.map((r) => r.toLowerCase()));

		// Role check (any match)
		if (options.roles && options.roles.length > 0) {
			const ok = options.roles.some((r) => userRoles.has(r.toLowerCase()));
			if (!ok) {
				return c.json({ error: "Forbidden" }, 403);
			}
		}

		const hasWildcard = userScopes.has("*");

		// All scopes check
		if (options.allScopes && options.allScopes.length > 0 && !hasWildcard) {
			const ok = options.allScopes.every((s) => userScopes.has(s));
			if (!ok) {
				return c.json({ error: "Forbidden" }, 403);
			}
		}

		// Any scopes check
		if (options.anyScopes && options.anyScopes.length > 0 && !hasWildcard) {
			const ok = options.anyScopes.some((s) => userScopes.has(s));
			if (!ok) {
				return c.json({ error: "Forbidden" }, 403);
			}
		}

		await next();
	};
}
