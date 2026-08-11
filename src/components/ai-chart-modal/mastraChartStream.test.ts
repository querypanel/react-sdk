import { describe, expect, it } from "vitest";
import {
	consumeMastraChartStream,
	getMastraChunkErrorMessage,
	MastraStreamTerminalError,
	normalizeMastraChunk,
	unwrapMastraToolResult,
} from "./mastraChartStream";

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
