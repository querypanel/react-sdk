import type { Context, Next } from "hono";
import type { AuthContext } from "../../src/types/auth";

/**
 * Default test auth context
 * Matches the previous development mode defaults for backward compatibility
 */
export const DEFAULT_TEST_AUTH: AuthContext = {
	method: "jwt",
	organizationId: "23011c66-b1dd-40f3-bc88-4065c6357d39",
	tenantId: "3",
	userId: "dev-user",
	scopes: ["*"],
	roles: ["admin"],
};

/**
 * Creates a test auth middleware that injects a custom auth context
 * Use this instead of the real authMiddleware in tests
 *
 * @param authContext - Optional custom auth context. Defaults to DEFAULT_TEST_AUTH
 * @returns Hono middleware handler that sets auth context
 *
 * @example
 * // Use default test auth
 * app.use("*", createTestAuthMiddleware());
 *
 * @example
 * // Use custom auth context
 * app.use("*", createTestAuthMiddleware({
 *   organizationId: "custom-org",
 *   tenantId: "custom-tenant",
 *   roles: ["viewer"],
 * }));
 */
export function createTestAuthMiddleware(
	authContext: Partial<AuthContext> = {},
) {
	const finalAuthContext: AuthContext = {
		...DEFAULT_TEST_AUTH,
		...authContext,
	};

	return async (c: Context, next: Next) => {
		c.set("auth", finalAuthContext);
		await next();
	};
}

/**
 * Helper to create a custom auth context by overriding defaults
 * Useful when you need to pass auth contexts to functions directly
 *
 * @param overrides - Partial auth context to merge with defaults
 * @returns Complete AuthContext
 *
 * @example
 * const customAuth = createAuthContext({
 *   organizationId: "org-123",
 *   roles: ["viewer"],
 * });
 */
export function createAuthContext(
	overrides: Partial<AuthContext> = {},
): AuthContext {
	return {
		...DEFAULT_TEST_AUTH,
		...overrides,
	};
}
