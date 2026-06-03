import {
	extractAssistantTextFromChunk,
	extractToolResultsFromChunk,
	formatToolStatus,
	type MastraStreamChunk,
} from "./mastraChartStream";
import type { MastraChartMessage, SqlExecutionArtifact, ToolEvent } from "./types";

/** Same contract as node-sdk mapGeneratedParams: array index → $1, $2, $3. */
function mapGeneratedParams(params: unknown) {
	if (!Array.isArray(params)) {
		return null;
	}

	return params.reduce<Record<string, unknown>>((acc, param, index) => {
		if (!param || typeof param !== "object") {
			return acc;
		}

		const record = param as Record<string, unknown>;
		const value = record.value;
		if (value === undefined) {
			return acc;
		}

		acc[String(index + 1)] = value;

		const key =
			(typeof record.name === "string" && record.name.trim()) ||
			(typeof record.placeholder === "string" && record.placeholder.trim()) ||
			(typeof record.position === "number" && String(record.position)) ||
			String(index + 1);

		acc[key.replace(/[{}]/g, "").replace(/(.+):.*$/, "$1").replace(/^[:$]/, "").trim()] =
			value;
		return acc;
	}, {});
}

function normalizeSqlParams(params: unknown): Record<string, unknown> | null {
	if (Array.isArray(params)) {
		return mapGeneratedParams(params);
	}

	if (params && typeof params === "object" && !Array.isArray(params)) {
		return params as Record<string, unknown>;
	}

	return null;
}

export type MastraChartChunkHandlerContext = {
	assistantMessageId: string;
	createMessageId: (prefix: string) => string;
	updateAssistantMessage: (
		updates: Partial<MastraChartMessage> | ((current: MastraChartMessage) => MastraChartMessage),
	) => void;
	setTransientStatus: (status: string | null) => void;
	setToolEvents: (updater: (prev: ToolEvent[]) => ToolEvent[]) => void;
	setMessages: (updater: (prev: MastraChartMessage[]) => MastraChartMessage[]) => void;
	setLastSqlExecution: (artifact: SqlExecutionArtifact | null) => void;
};

export function createMastraChartChunkHandler(
	ctx: MastraChartChunkHandlerContext,
): (chunk: MastraStreamChunk) => void {
	const { assistantMessageId: currentAssistantMessageId, createMessageId } = ctx;

	return (rawChunk: MastraStreamChunk) => {
		const chunk = rawChunk;

		if (typeof chunk.toolName === "string" && chunk.toolName.trim().length > 0) {
			ctx.setTransientStatus(formatToolStatus(chunk.toolName));
			const toolName = chunk.toolName.trim();
			ctx.setToolEvents((prev) => {
				const existingRunning = prev.find(
					(event) => event.toolName === toolName && event.status === "running",
				);
				if (existingRunning) return prev;
				const id = createMessageId(`tool-${toolName}`);
				return [
					...prev,
					{ id, toolName, status: "running", startedAt: Date.now() },
				];
			});
		}

		const chunkError =
			chunk.error && typeof chunk.error === "object"
				? (typeof chunk.error.message === "string" ? chunk.error.message : null)
				: null;
		if (typeof chunkError === "string" && chunkError.trim().length > 0) {
			ctx.setTransientStatus(null);
			const toolName = typeof chunk.toolName === "string" ? chunk.toolName : undefined;
			ctx.setToolEvents((prev) =>
				prev.map((event) =>
					toolName && event.toolName === toolName && event.status === "running"
						? { ...event, status: "failed", endedAt: Date.now(), error: chunkError.trim() }
						: event,
				),
			);
		}

		const applyToolResult = (toolName: string, result: Record<string, unknown>) => {
			if (toolName === "generate_sql") {
				console.log("[AIChartModal] generated sql", {
					sql: typeof result.sql === "string" ? result.sql : null,
					params: mapGeneratedParams(result.params),
				});
				ctx.setToolEvents((prev) =>
					prev.map((event) =>
						event.toolName === "generate_sql" && event.status === "running"
							? { ...event, status: "succeeded", endedAt: Date.now() }
							: event,
					),
				);
				ctx.updateAssistantMessage((current) => ({
					...current,
					sql: typeof result.sql === "string" ? result.sql : current.sql,
					rationale:
						typeof result.rationale === "string" ? result.rationale : current.rationale,
					sqlParams: mapGeneratedParams(result.params) ?? current.sqlParams ?? null,
				}));
				return true;
			}

			if (toolName === "execute_sql") {
				const rows = Array.isArray(result.rows)
					? (result.rows as Array<Record<string, unknown>>)
					: [];
				const fields = Array.isArray(result.fields) ? (result.fields as string[]) : [];
				const queryResult: SqlExecutionArtifact = {
					resultId: typeof result.resultId === "string" ? result.resultId : undefined,
					rows,
					fields,
					rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
					database: typeof result.database === "string" ? result.database : undefined,
					dialect: typeof result.dialect === "string" ? result.dialect : undefined,
					datasource:
						result.datasource && typeof result.datasource === "object"
							? (result.datasource as { id: string; name: string; dialect: string })
							: undefined,
				};
				console.log("[AIChartModal] query data", {
					rowCount: queryResult.rowCount,
					fields,
					rows,
				});
				ctx.setToolEvents((prev) =>
					prev.map((event) =>
						event.toolName === "execute_sql" && event.status === "running"
							? { ...event, status: "succeeded", endedAt: Date.now() }
							: event,
					),
				);
				ctx.setLastSqlExecution(queryResult);
				ctx.updateAssistantMessage((current) => ({
					...current,
					resultId: queryResult.resultId ?? current.resultId,
					queryResult,
				}));
				return true;
			}

			if (toolName === "generate_visualization") {
				ctx.setTransientStatus(null);
				ctx.setToolEvents((prev) =>
					prev.map((event) =>
						event.toolName === "generate_visualization" && event.status === "running"
							? { ...event, status: "succeeded", endedAt: Date.now() }
							: event,
					),
				);
				const chartSpec = result.spec ?? null;
				const jsonRenderSpec = result.jsonRenderSpec ?? null;
				const resultId =
					typeof result.resultId === "string" ? result.resultId : undefined;
				const presentationKind =
					result.presentationKind === "chart" ||
					result.presentationKind === "table" ||
					result.presentationKind === "metric"
						? result.presentationKind
						: undefined;
				const sql = typeof result.sql === "string" ? result.sql : undefined;
				const sqlParams = normalizeSqlParams(result.params) ?? null;
				const queryResult: SqlExecutionArtifact | undefined = Array.isArray(
					result.previewRows,
				)
					? {
							resultId,
							rows: result.previewRows as Array<Record<string, unknown>>,
							fields: Array.isArray(result.fields) ? (result.fields as string[]) : [],
							rowCount:
								typeof result.rowCount === "number"
									? result.rowCount
									: (result.previewRows as Array<Record<string, unknown>>).length,
							database: typeof result.database === "string" ? result.database : undefined,
							dialect: typeof result.dialect === "string" ? result.dialect : undefined,
							datasource: undefined,
						}
					: undefined;
				const rationale =
					typeof result.rationale === "string" && result.rationale.trim().length > 0
						? result.rationale
						: typeof result.notes === "string" && result.notes.trim().length > 0
							? result.notes
							: undefined;

				const chartMessage: MastraChartMessage = {
					id: `${currentAssistantMessageId}-chart`,
					role: "assistant",
					kind: "chart",
					sourceAssistantId: currentAssistantMessageId,
					content: "",
					chartSpec,
					jsonRenderSpec,
					resultId,
					presentationKind,
					sql,
					sqlParams,
					queryResult,
					rationale,
					timestamp: new Date(),
				};

				const actionMessage: MastraChartMessage = {
					id: `${currentAssistantMessageId}-action`,
					role: "assistant",
					kind: "action",
					sourceAssistantId: currentAssistantMessageId,
					content: "Add to dashboard",
					chartSpec,
					jsonRenderSpec,
					resultId,
					presentationKind,
					sql,
					sqlParams,
					queryResult,
					rationale,
					timestamp: new Date(),
				};

				ctx.setMessages((prev) => {
					const withoutStatus = prev.filter(
						(message) => message.id !== currentAssistantMessageId,
					);
					const chartIndex = withoutStatus.findIndex(
						(message) => message.id === chartMessage.id,
					);
					const actionIndex = withoutStatus.findIndex(
						(message) => message.id === actionMessage.id,
					);

					if (chartIndex !== -1 || actionIndex !== -1) {
						return withoutStatus.map((message) => {
							if (message.id === chartMessage.id) return { ...message, ...chartMessage };
							if (message.id === actionMessage.id) return { ...message, ...actionMessage };
							return message;
						});
					}

					const insertAt = Math.min(
						prev.findIndex((message) => message.id === currentAssistantMessageId),
						withoutStatus.length,
					);
					const safeInsertAt = insertAt >= 0 ? insertAt : withoutStatus.length;
					const next = [...withoutStatus];
					next.splice(safeInsertAt, 0, chartMessage, actionMessage);
					return next;
				});

				return true;
			}

			return false;
		};

		if (chunk.type === "text-delta" && chunk.textDelta) {
			ctx.setTransientStatus(null);
			ctx.updateAssistantMessage((current) => ({
				...current,
				content: `${current.content}${chunk.textDelta}`,
			}));
			return;
		}

		if (
			chunk.type === "tool-result" &&
			chunk.toolName === "generate_sql" &&
			chunk.result &&
			typeof chunk.result === "object"
		) {
			applyToolResult("generate_sql", chunk.result as Record<string, unknown>);
			return;
		}

		if (
			chunk.type === "tool-result" &&
			chunk.toolName === "execute_sql" &&
			chunk.result &&
			typeof chunk.result === "object"
		) {
			applyToolResult("execute_sql", chunk.result as Record<string, unknown>);
			return;
		}

		if (
			chunk.type === "tool-result" &&
			chunk.toolName === "generate_visualization" &&
			chunk.result &&
			typeof chunk.result === "object"
		) {
			applyToolResult("generate_visualization", chunk.result as Record<string, unknown>);
			return;
		}

		if (chunk.type === "step-finish") {
			ctx.setTransientStatus(null);
			ctx.setToolEvents((prev) =>
				prev.map((event) =>
					event.status === "running"
						? { ...event, status: "succeeded", endedAt: Date.now() }
						: event,
				),
			);
			for (const embeddedResult of extractToolResultsFromChunk(chunk)) {
				applyToolResult(embeddedResult.toolName, embeddedResult.result);
			}
			const assistantText = extractAssistantTextFromChunk(chunk);
			if (assistantText && assistantText.trim().length > 0) {
				const explanationMessage: MastraChartMessage = {
					id: `${currentAssistantMessageId}-explanation`,
					role: "assistant",
					kind: "explanation",
					sourceAssistantId: currentAssistantMessageId,
					content: assistantText,
					timestamp: new Date(),
				};

				ctx.setMessages((prev) => {
					const withoutStatus = prev.filter(
						(message) => message.id !== currentAssistantMessageId,
					);
					const existingIndex = withoutStatus.findIndex(
						(message) => message.id === explanationMessage.id,
					);
					if (existingIndex !== -1) {
						return withoutStatus.map((message) =>
							message.id === explanationMessage.id
								? { ...message, ...explanationMessage }
								: message,
						);
					}

					const anchorIndex = withoutStatus.reduce((max, message, index) => {
						if (message.sourceAssistantId === currentAssistantMessageId) {
							return index;
						}
						return max;
					}, -1);
					const insertAt = anchorIndex >= 0 ? anchorIndex + 1 : withoutStatus.length;
					const next = [...withoutStatus];
					next.splice(insertAt, 0, explanationMessage);
					return next;
				});
			}
		}
	};
}
