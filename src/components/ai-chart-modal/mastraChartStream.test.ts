import { describe, expect, it } from "vitest";
import {
	consumeMastraChartStream,
	getMastraChunkErrorMessage,
	isMastraAgentStreamUrl,
	MastraStreamTerminalError,
	normalizeMastraChunk,
	readHttpErrorMessage,
	unwrapMastraToolResult,
} from "./mastraChartStream";

describe("readHttpErrorMessage", () => {
	it("reads flat and nested JSON error messages", async () => {
		await expect(
			readHttpErrorMessage(
				new Response(JSON.stringify({ error: "tenantId is required" }), {
					status: 400,
				}),
			),
		).resolves.toBe("tenantId is required");
		await expect(
			readHttpErrorMessage(
				new Response(
					JSON.stringify({ error: { message: "Dashboard not found" } }),
					{ status: 404 },
				),
			),
		).resolves.toBe("Dashboard not found");
	});

	it("preserves plain-text errors and hides HTML responses", async () => {
		await expect(
			readHttpErrorMessage(new Response("Upstream validation failed", { status: 400 })),
		).resolves.toBe("Upstream validation failed");
		await expect(
			readHttpErrorMessage(new Response("<!doctype html><h1>Error</h1>", { status: 500 })),
		).resolves.toBe("Failed to generate chart");
	});
});

describe("getMastraChunkErrorMessage", () => {
	it("reads proxy terminal error events", () => {
		expect(
			getMastraChunkErrorMessage({
				type: "error",
				error: { message: "Stream interrupted" },
			}),
		).toBe("Stream interrupted");
	});
});

describe("unwrapMastraToolResult", () => {
	it("flags Mastra validation error payloads", () => {
		expect(
			unwrapMastraToolResult({
				type: "tool-result",
				toolName: "execute_sql",
				result: { error: true, message: "Tool output validation failed" },
			}),
		).toEqual({
			ok: false,
			message: "Tool output validation failed",
		});
	});

	it("accepts successful nested payload results", () => {
		const chunk = normalizeMastraChunk({
			type: "tool-result",
			payload: {
				toolName: "execute_sql",
				result: { rows: [{ a: 1 }], rowCount: 1, fields: ["a"] },
			},
		});
		expect(unwrapMastraToolResult(chunk)).toEqual({
			ok: true,
			result: { rows: [{ a: 1 }], rowCount: 1, fields: ["a"] },
		});
	});
});

describe("consumeMastraChartStream", () => {
	it("throws MastraStreamTerminalError on type error before [DONE]", async () => {
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ type: "error", error: { message: "other side closed" } })}\n\n`,
					),
				);
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const chunks: unknown[] = [];
		await expect(
			consumeMastraChartStream(body, (chunk) => {
				chunks.push(chunk);
			}),
		).rejects.toBeInstanceOf(MastraStreamTerminalError);

		expect(chunks).toHaveLength(0);
	});
});

describe("isMastraAgentStreamUrl", () => {
	it("matches the admin agent proxy and the API embed stream route", () => {
		expect(isMastraAgentStreamUrl("/api/agents/sql-agent/stream")).toBe(true);
		expect(isMastraAgentStreamUrl("/api/agents/sql-agent/stream?cache=auto")).toBe(true);
		expect(isMastraAgentStreamUrl("https://api.querypanel.io/ai/agent/stream")).toBe(true);
	});

	it("leaves the classic JSON endpoints on the classic path", () => {
		expect(isMastraAgentStreamUrl("/api/ai/generate-chart-with-sql")).toBe(false);
		expect(isMastraAgentStreamUrl("https://api.querypanel.io/ai/generate-chart-with-sql")).toBe(false);
		expect(isMastraAgentStreamUrl("https://api.querypanel.io/ai/agent/streaming")).toBe(false);
	});
});
