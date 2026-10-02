import {
	extractAssistantTextFromChunk,
	extractToolResultsFromChunk,
	formatToolStatus,
	isMastraToolStartChunk,
	unwrapMastraToolResult,
	type MastraStreamChunk,
} from "./mastraChartStream";
import { hydrateJsonRenderSpecFromRows } from "../generative-ui/specData";
import type {
	MastraChartMessage,
	ReportBlock,
	ReportDataBlock,
	ReportTextBlock,
	ReportVizBlock,
	SqlExecutionArtifact,
	ToolEvent,
} from "./types";

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

function upsertTextBlock(
	blocks: ReportBlock[],
	createBlockId: (prefix: string) => string,
	delta: string,
): ReportBlock[] {
	const next = [...blocks];
	const existingIndex = next.findIndex((block) => block.type === "text");
	if (existingIndex === -1) {
		const textBlock: ReportTextBlock = {
			id: createBlockId("text"),
			type: "text",
			content: delta,
			streaming: true,
		};
		next.push(textBlock);
		return next;
	}

	const existing = next[existingIndex] as ReportTextBlock;
	next[existingIndex] = {
		...existing,
		content: `${existing.content}${delta}`,
		streaming: true,
	};
	return next;
}

function upsertDataBlock(
	blocks: ReportBlock[],
	createBlockId: (prefix: string) => string,
	queryResult: SqlExecutionArtifact,
): ReportBlock[] {
	const next = [...blocks];
	const existingIndex = next.findIndex((block) => block.type === "data");
	const dataBlock: ReportDataBlock = {
		id:
			existingIndex >= 0
				? (next[existingIndex] as ReportDataBlock).id
				: createBlockId("data"),
		type: "data",
		queryResult,
	};
	if (existingIndex >= 0) {
		next[existingIndex] = dataBlock;
	} else {
		next.push(dataBlock);
	}
	return next;
}

function appendOrReplaceVizBlock(
	blocks: ReportBlock[],
	createBlockId: (prefix: string) => string,
	viz: Omit<ReportVizBlock, "id" | "type"> & { id?: string },
): ReportBlock[] {
	const next = [...blocks];
	const id = viz.id ?? createBlockId("viz");
	const vizBlock: ReportVizBlock = {
		id,
		type: "viz",
		chartSpec: viz.chartSpec,
		jsonRenderSpec: viz.jsonRenderSpec,
		resultId: viz.resultId,
		presentationKind: viz.presentationKind,
		sql: viz.sql,
		sqlParams: viz.sqlParams,
		queryResult: viz.queryResult,
		rationale: viz.rationale,
	};
	const existingIndex = next.findIndex(
		(block) => block.type === "viz" && block.id === id,
	);
	if (existingIndex >= 0) {
		next[existingIndex] = vizBlock;
	} else {
		next.push(vizBlock);
	}
	return next;
}

export type MastraChartChunkHandlerContext = {
	assistantMessageId: string;
	createMessageId: (prefix: string) => string;
	updateAssistantMessage: (
		updates: Partial<MastraChartMessage> | ((current: MastraChartMessage) => MastraChartMessage),
	) => void;
	setTransientStatus: (status: string | null) => void;
	setToolEvents: (updater: (prev: ToolEvent[]) => ToolEvent[]) => void;
	setLastSqlExecution: (artifact: SqlExecutionArtifact | null) => void;
};

export function createMastraChartChunkHandler(
	ctx: MastraChartChunkHandlerContext,
): (chunk: MastraStreamChunk) => void {
	const { createMessageId } = ctx;

	return (rawChunk: MastraStreamChunk) => {
		const chunk = rawChunk;

		if (
			isMastraToolStartChunk(chunk) &&
			typeof chunk.toolName === "string" &&
			chunk.toolName.trim().length > 0
		) {
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

		const finishTool = (
			toolName: string,
			patch: Partial<Pick<ToolEvent, "status" | "error">>,
		) => {
			ctx.setToolEvents((prev) =>
				prev.map((event) =>
					event.toolName === toolName && event.status === "running"
						? { ...event, endedAt: Date.now(), ...patch }
						: event,
				),
			);
		};

		const markToolFailed = (toolName: string | undefined, message: string) => {
			ctx.setTransientStatus(null);
			if (!toolName) return;
			finishTool(toolName, { status: "failed", error: message });
		};

		const chunkError =
			chunk.error && typeof chunk.error === "object"
				? typeof chunk.error.message === "string"
					? chunk.error.message
					: null
				: null;
		if (typeof chunkError === "string" && chunkError.trim().length > 0) {
			markToolFailed(
				typeof chunk.toolName === "string" ? chunk.toolName : undefined,
				chunkError.trim(),
			);
		}

		const applyToolResult = (toolName: string, result: Record<string, unknown>) => {
			if (toolName === "generate_sql") {
				finishTool("generate_sql", { status: "succeeded" });
				ctx.updateAssistantMessage((current) => ({
					...current,
					kind: "turn",
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
				finishTool("execute_sql", { status: "succeeded" });
				ctx.setTransientStatus("Working");

				// Don't clobber a good preview with an empty/partial follow-up payload.
				const hasRows = queryResult.rows.length > 0 || queryResult.rowCount > 0;
				if (!hasRows) {
					ctx.updateAssistantMessage((current) => {
						const existingCount = current.queryResult?.rowCount ?? 0;
						const existingRows = current.queryResult?.rows?.length ?? 0;
						if (existingCount > 0 || existingRows > 0) {
							return current;
						}
						return {
							...current,
							kind: "turn",
							resultId: queryResult.resultId ?? current.resultId,
							queryResult,
							blocks: upsertDataBlock(
								current.blocks ?? [],
								createMessageId,
								queryResult,
							),
						};
					});
					return true;
				}

				ctx.setLastSqlExecution(queryResult);
				ctx.updateAssistantMessage((current) => ({
					...current,
					kind: "turn",
					resultId: queryResult.resultId ?? current.resultId,
					queryResult,
					blocks: upsertDataBlock(
						current.blocks ?? [],
						createMessageId,
						queryResult,
					),
				}));
				return true;
			}

			if (toolName === "generate_visualization") {
				ctx.setTransientStatus(null);
				finishTool("generate_visualization", { status: "succeeded" });
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
				let rationale: string | undefined;
				if (typeof result.rationale === "string" && result.rationale.trim()) {
					rationale = result.rationale;
				} else if (typeof result.notes === "string" && result.notes.trim()) {
					rationale = result.notes;
				}

				const vizId = createMessageId("viz");
				ctx.updateAssistantMessage((current) => {
					const hydrateFrom = [queryResult, current.queryResult].find(
						(candidate) => candidate && candidate.rows.length > 0,
					);
					const hydratedJsonRenderSpec = hydrateJsonRenderSpecFromRows(
						jsonRenderSpec,
						hydrateFrom?.rows,
						hydrateFrom?.fields,
					);

					return {
						...current,
						kind: "turn",
						chartSpec: chartSpec ?? current.chartSpec,
						jsonRenderSpec: hydratedJsonRenderSpec ?? current.jsonRenderSpec,
						resultId: resultId ?? current.resultId,
						presentationKind: presentationKind ?? current.presentationKind,
						sql: sql ?? current.sql,
						sqlParams: sqlParams ?? current.sqlParams ?? null,
						queryResult: queryResult ?? current.queryResult,
						rationale: rationale ?? current.rationale,
						blocks: appendOrReplaceVizBlock(current.blocks ?? [], createMessageId, {
							id: vizId,
							chartSpec: chartSpec ?? undefined,
							jsonRenderSpec: hydratedJsonRenderSpec ?? undefined,
							resultId,
							presentationKind,
							sql: sql ?? current.sql,
							sqlParams: sqlParams ?? current.sqlParams ?? null,
							queryResult: queryResult ?? current.queryResult,
							rationale,
						}),
					};
				});

				return true;
			}

			return false;
		};

		if (chunk.type === "text-delta" && chunk.textDelta) {
			ctx.setTransientStatus(null);
			ctx.updateAssistantMessage((current) => ({
				...current,
				kind: "turn",
				content: `${current.content}${chunk.textDelta}`,
				blocks: upsertTextBlock(
					current.blocks ?? [],
					createMessageId,
					chunk.textDelta ?? "",
				),
			}));
			return;
		}

		if (
			(chunk.type === "tool-result" || chunk.type === "tool-error") &&
			typeof chunk.toolName === "string" &&
			chunk.toolName.trim().length > 0
		) {
			const toolName = chunk.toolName.trim();
			const unwrapped = unwrapMastraToolResult(chunk);
			if (unwrapped == null) {
				if (chunk.type === "tool-error") {
					markToolFailed(toolName, "Tool failed");
				}
				return;
			}
			if (!unwrapped.ok) {
				markToolFailed(toolName, unwrapped.message);
				return;
			}
			applyToolResult(toolName, unwrapped.result);
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
				const unwrapped = unwrapMastraToolResult({
					type: "tool-result",
					toolName: embeddedResult.toolName,
					result: embeddedResult.result,
				});
				if (!unwrapped || !unwrapped.ok) {
					continue;
				}
				applyToolResult(embeddedResult.toolName, unwrapped.result);
			}
			const assistantText = extractAssistantTextFromChunk(chunk);
			if (assistantText && assistantText.trim().length > 0) {
				ctx.updateAssistantMessage((current) => {
					const hasText = (current.blocks ?? []).some(
						(block) => block.type === "text" && block.content.trim().length > 0,
					);
					if (hasText || current.content.trim().length > 0) {
						// Prefer streamed deltas; only fill if empty.
						if (current.content.trim().length === 0) {
							return {
								...current,
								kind: "turn",
								content: assistantText,
								blocks: upsertTextBlock(
									current.blocks ?? [],
									createMessageId,
									assistantText,
								),
							};
						}
						return current;
					}
					return {
						...current,
						kind: "turn",
						content: assistantText,
						blocks: upsertTextBlock(
							current.blocks ?? [],
							createMessageId,
							assistantText,
						),
					};
				});
			}
		}
	};
}
