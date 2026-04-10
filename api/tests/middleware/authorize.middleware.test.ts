import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { authorize } from "../../src/middleware/authorize.middleware";
import type { AuthContext } from "../../src/types/auth";

describe("authorize middleware", () => {
	describe("Unauthorized access", () => {
		test("should return 401 when no auth context", async () => {
			const app = new Hono();
			app.get("/test", authorize({ anyScopes: ["read:data"] }), (c) =>
				c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe("Unauthorized");
		});
	});

	describe("Role-based authorization", () => {
		test("should allow access with matching role", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: [],
					roles: ["admin"],
				} as AuthContext);
				await next();
			});
			app.get("/test", authorize({ roles: ["admin"] }), (c) =>
				c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});

		test("should deny access without matching role", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: [],
					roles: ["viewer"],
				} as AuthContext);
				await next();
			});
			app.get("/test", authorize({ roles: ["admin"] }), (c) =>
				c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.error).toBe("Forbidden");
		});

		test("should allow access with any matching role", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: [],
					roles: ["viewer", "editor"],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ roles: ["admin", "editor", "trainer"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});
	});

	describe("Scope-based authorization - anyScopes", () => {
		test("should allow access with any matching scope", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data", "write:data"],
					roles: [],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ anyScopes: ["read:data", "delete:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});

		test("should deny access without any matching scope", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data"],
					roles: [],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ anyScopes: ["write:data", "delete:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.error).toBe("Forbidden");
		});
	});

	describe("Scope-based authorization - allScopes", () => {
		test("should allow access with all required scopes", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data", "write:data", "delete:data"],
					roles: [],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ allScopes: ["read:data", "write:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});

		test("should deny access without all required scopes", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data"],
					roles: [],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ allScopes: ["read:data", "write:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.error).toBe("Forbidden");
		});
	});

	describe("Wildcard scope", () => {
		test("should allow access with wildcard scope for anyScopes", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "apikey",
					scopes: ["*"],
					roles: ["admin"],
				} as AuthContext);
				await next();
			});
			app.get("/test", authorize({ anyScopes: ["super:secret:scope"] }), (c) =>
				c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});

		test("should allow access with wildcard scope for allScopes", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "apikey",
					scopes: ["*"],
					roles: ["admin"],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ allScopes: ["read:data", "write:data", "delete:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});
	});

	describe("Combined authorization", () => {
		test("should require both role and scope matches", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data"],
					roles: ["viewer"],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ roles: ["viewer"], anyScopes: ["read:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});

		test("should deny if role matches but scope does not", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data"],
					roles: ["viewer"],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ roles: ["viewer"], anyScopes: ["write:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.error).toBe("Forbidden");
		});

		test("should deny if scope matches but role does not", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: ["read:data"],
					roles: ["viewer"],
				} as AuthContext);
				await next();
			});
			app.get(
				"/test",
				authorize({ roles: ["admin"], anyScopes: ["read:data"] }),
				(c) => c.json({ ok: true }),
			);

			const res = await app.request("/test");

			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.error).toBe("Forbidden");
		});
	});

	describe("Empty authorization options", () => {
		test("should allow access when no authorization rules specified", async () => {
			const app = new Hono();
			app.use("*", async (c, next) => {
				c.set("auth", {
					method: "jwt",
					organizationId: "org-123",
					scopes: [],
					roles: [],
				} as AuthContext);
				await next();
			});
			app.get("/test", authorize({}), (c) => c.json({ ok: true }));

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.ok).toBe(true);
		});
	});
});
