import type { Hono } from "hono";
import { z } from "zod";
import { createLogger } from "../lib/logger";
import {
	sessionGetQuerySchema,
	sessionListQuerySchema,
	updateSessionRequestSchema,
} from "../schemas/session.schema";
import type { SessionService } from "../services/session.service";
import type { AppContext } from "../types/app";

interface SessionRouteDeps {
	sessionService: SessionService;
}

export const registerSessionRoutes = (
	app: Hono<AppContext>,
	{ sessionService }: SessionRouteDeps,
) => {
	const logger = createLogger("session-route");

	// List sessions (paginated)
	app.get("/sessions", async (c) => {
		try {
			const queryParams = c.req.query();
			const validated = sessionListQuerySchema.parse(queryParams);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ query: validated }, "Listing sessions");

			const result = await sessionService.listSessions(auth, validated);

			return c.json(result);
		} catch (error) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid query parameters",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to list sessions");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Get session by session_id
	app.get("/sessions/:sessionId", async (c) => {
		try {
			const sessionId = c.req.param("sessionId");
			const queryParams = c.req.query();
			const validated = sessionGetQuerySchema.parse(queryParams);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ sessionId }, "Getting session");

			const session = await sessionService.getSession(auth, sessionId, {
				includeTurns: validated.include_turns,
			});

			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}

			return c.json(session);
		} catch (error) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid query parameters",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to get session");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Update session metadata
	app.patch("/sessions/:sessionId", async (c) => {
		try {
			const sessionId = c.req.param("sessionId");
			const body = await c.req.json();
			const validated = updateSessionRequestSchema.parse(body);
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ sessionId }, "Updating session");

			const updated = await sessionService.updateSession(auth, sessionId, {
				title: validated.title,
			});

			if (!updated) {
				return c.json({ error: "Session not found" }, 404);
			}

			return c.json(updated);
		} catch (error) {
			if (error instanceof z.ZodError) {
				logger.warn({ errors: error.issues }, "Validation error");
				return c.json(
					{
						error: "Invalid request body",
						details: error.issues,
					},
					400,
				);
			}
			logger.error({ error }, "Failed to update session");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});

	// Delete session
	app.delete("/sessions/:sessionId", async (c) => {
		try {
			const sessionId = c.req.param("sessionId");
			const auth = c.get("auth");

			if (!auth?.organizationId) {
				return c.json({ error: "Authentication required" }, 401);
			}

			logger.debug({ sessionId }, "Deleting session");

			await sessionService.deleteSession(auth, sessionId);

			return c.body(null, 204);
		} catch (error) {
			logger.error({ error }, "Failed to delete session");
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: message }, 500);
		}
	});
};
