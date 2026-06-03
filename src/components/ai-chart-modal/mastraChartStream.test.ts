import { describe, expect, it } from "vitest";
import {
	consumeMastraChartStream,
	getMastraChunkErrorMessage,
	MastraStreamTerminalError,
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
