export type MastraStreamChunk = {
	type?: string;
	textDelta?: string;
	toolName?: string;
	result?: unknown;
	error?: { message?: unknown };
	payload?: Record<string, unknown>;
	response?: {
		messages?: Array<{
			role?: string;
			content?: Array<{
				type?: string;
				text?: string;
				result?: unknown;
				toolName?: string;
			}>;
		}>;
		uiMessages?: Array<{
			role?: string;
			metadata?: Record<string, unknown>;
		}>;
	};
};

export class MastraStreamTerminalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MastraStreamTerminalError";
	}
}

export function getMastraChunkErrorMessage(chunk: MastraStreamChunk): string | null {
	if (chunk.type === "error") {
		const message = chunk.error?.message;
		if (typeof message === "string" && message.trim().length > 0) {
			return message.trim();
		}
		return "Stream interrupted";
	}

	if (chunk.error && typeof chunk.error === "object") {
		const message = chunk.error.message;
		if (typeof message === "string" && message.trim().length > 0) {
			return message.trim();
		}
	}

	return null;
}

export function normalizeMastraChunk(raw: MastraStreamChunk): MastraStreamChunk {
	const payload = raw.payload;
	if (payload && typeof payload === "object" && !Array.isArray(payload)) {
		const merged = { ...raw, ...payload } as MastraStreamChunk;
		delete (merged as { payload?: unknown }).payload;
		if (
			merged.type === "text-delta" &&
			typeof merged.textDelta !== "string" &&
			typeof (payload as { text?: unknown }).text === "string"
		) {
			merged.textDelta = (payload as { text: string }).text;
		}
		if (
			merged.type === "step-finish" &&
			!merged.response &&
			Array.isArray((payload as { messages?: unknown }).messages)
		) {
			merged.response = {
				messages: (payload as { messages: NonNullable<MastraStreamChunk["response"]>["messages"] })
					.messages,
			};
		}
		return merged;
	}
	return raw;
}

export function extractAssistantTextFromChunk(chunk: MastraStreamChunk) {
	const assistantMessage = chunk.response?.messages?.find(
		(message) => message.role === "assistant",
	);
	const textPart = assistantMessage?.content?.find(
		(part) => part.type === "text" && typeof part.text === "string",
	);
	return textPart?.text;
}

export function extractToolResultsFromChunk(chunk: MastraStreamChunk) {
	const results: Array<{ toolName: string; result: Record<string, unknown> }> = [];

	for (const message of chunk.response?.messages ?? []) {
		for (const part of message.content ?? []) {
			if (
				typeof part.toolName === "string" &&
				part.toolName.trim().length > 0 &&
				part.result &&
				typeof part.result === "object" &&
				!Array.isArray(part.result)
			) {
				results.push({
					toolName: part.toolName.trim(),
					result: part.result as Record<string, unknown>,
				});
			}
		}
	}

	return results;
}

export function formatToolStatus(toolName: string) {
	switch (toolName) {
		case "search_schema":
		case "search_relevant_schema":
			return "Searching schema";
		case "generate_sql":
			return "Generating SQL";
		case "execute_sql":
			return "Running SQL";
		case "generate_visualization":
			return "Building visualization";
		default:
			return toolName
				.split("_")
				.filter(Boolean)
				.map((part, index) =>
					index === 0
						? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase().replace(/s$/, "ing")
						: part.toLowerCase(),
				)
				.join(" ");
	}
}

export type MastraChartStreamChunkHandler = (chunk: MastraStreamChunk) => void;

/**
 * Reads an SSE body from the sql-agent proxy and invokes `onChunk` for each Mastra event.
 * Throws {@link MastraStreamTerminalError} when the proxy emits `type: "error"`.
 */
export async function consumeMastraChartStream(
	body: ReadableStream<Uint8Array>,
	onChunk: MastraChartStreamChunkHandler,
): Promise<void> {
	const decoder = new TextDecoder();
	const reader = body.getReader();
	let buffer = "";
	let streamDone = false;

	try {
		while (!streamDone) {
			const { done, value } = await reader.read();
			streamDone = done;
			buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

			let boundaryIndex = buffer.indexOf("\n\n");
			while (boundaryIndex !== -1) {
				const rawEvent = buffer.slice(0, boundaryIndex);
				buffer = buffer.slice(boundaryIndex + 2);
				boundaryIndex = buffer.indexOf("\n\n");

				const payload = rawEvent
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.join("\n");

				if (!payload) {
					continue;
				}

				if (payload === "[DONE]") {
					streamDone = true;
					break;
				}

				let parsed: MastraStreamChunk;
				try {
					parsed = JSON.parse(payload) as MastraStreamChunk;
				} catch (error) {
					console.error("Failed to parse Mastra stream chunk:", error);
					continue;
				}

				const chunk = normalizeMastraChunk(parsed);
				const terminalMessage = getMastraChunkErrorMessage(chunk);
				if (terminalMessage) {
					throw new MastraStreamTerminalError(terminalMessage);
				}

				onChunk(chunk);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
