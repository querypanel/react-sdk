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
	PlanStep,
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

const PLAN_STATUSES = ["pending", "in_progress", "done"];

/** Validates an `update_plan` result; returns null when malformed so the old plan stays. */
export function parsePlanSteps(result: Record<string, unknown>): PlanStep[] | null {
	if (!Array.isArray(result.steps)) return null;
	const steps: PlanStep[] = [];
	for (const raw of result.steps) {
		if (!raw || typeof raw !== "object") return null;
		const step = raw as Record<string, unknown>;
		if (
			typeof step.id !== "string" ||
			typeof step.title !== "string" ||
			!step.title.trim() ||
			typeof step.status !== "string" ||
			!PLAN_STATUSES.includes(step.status)
		) {
			return null;
		}
		steps.push({ id: step.id, title: step.title.trim(), status: step.status as PlanStep["status"] });
	}
	return steps.length > 0 ? steps : null;
}

/** Blank line between text from different agent steps; nothing before the first text or after a newline. */
export function separatorBeforeNextStep(existing: string): string {
	if (!existing.trim()) return "";
	if (existing.endsWith("\n\n")) return "";
	return existing.endsWith("\n") ? "\n" : "\n\n";
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

function datasourceIdOf(value: unknown): string | undefined {
	const id = value && typeof value === "object" ? (value as { id?: unknown }).id : undefined;
	return typeof id === "string" && id.length > 0 ? id : undefined;
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
	const vizBlock: ReportVizBlock = { ...viz, id, type: "viz" };
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
	// Text from separate agent steps (e.g. one insight per chart) must not run together.
	let paragraphBreakPending = false;

	return (chunk: MastraStreamChunk) => {
		if (chunk.type === "tool-result" || chunk.type === "step-finish") {
			paragraphBreakPending = true;
		}

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

		const applyToolResult = (toolName: string, result: Record<string, unknown>): boolean => {
			// Single-LLM agent: run_sql writes and runs the SQL in one step, and may carry the chart.
			if (toolName === "run_sql") {
				applyToolResult("generate_sql", {
					sql: result.sql,
					rationale: result.rationale,
					params: result.params,
				});
				applyToolResult("execute_sql", result);
				finishTool("run_sql", { status: "succeeded" });
				if (result.visualization && typeof result.visualization === "object") {
					applyToolResult("generate_visualization", {
						...(result.visualization as Record<string, unknown>),
						resultId: result.resultId,
						sql: result.sql,
						params: result.params,
						rationale: result.rationale,
						datasource: result.datasource,
					});
				}
				return true;
			}

			if (toolName === "update_plan") {
				finishTool("update_plan", { status: "succeeded" });
				const plan = parsePlanSteps(result);
				if (plan) {
					ctx.updateAssistantMessage((current) => ({ ...current, kind: "turn", plan }));
				}
				return true;
			}

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

				const hasRows = queryResult.rows.length > 0 || queryResult.rowCount > 0;
				if (hasRows) ctx.setLastSqlExecution(queryResult);
				ctx.updateAssistantMessage((current) => {
					// Don't clobber a good preview with an empty/partial follow-up payload.
					const hasExistingRows =
						(current.queryResult?.rowCount ?? 0) > 0 || (current.queryResult?.rows?.length ?? 0) > 0;
					if (!hasRows && hasExistingRows) return current;
					return {
						...current,
						kind: "turn",
						resultId: queryResult.resultId ?? current.resultId,
						queryResult,
						blocks: upsertDataBlock(current.blocks ?? [], createMessageId, queryResult),
					};
				});
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
					// Parallel report charts interleave their execute_sql results: only fall back to the
					// last one when it belongs to this chart.
					const lastResult =
						resultId && current.queryResult?.resultId && current.queryResult.resultId !== resultId
							? undefined
							: current.queryResult;
					const hydrateFrom = [queryResult, lastResult].find(
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
							queryResult: queryResult ?? lastResult,
							rationale,
							// Each chart keeps the datasource its SQL ran on, so adding it later never
							// depends on what the panel has selected by then.
							datasourceId: datasourceIdOf(result.datasource) ?? (queryResult ?? lastResult)?.datasource?.id,
						}),
					};
				});

				return true;
			}

			return false;
		};

		if (chunk.type === "text-delta" && chunk.textDelta) {
			ctx.setTransientStatus(null);
			const startsNewStep = paragraphBreakPending;
			paragraphBreakPending = false;
			ctx.updateAssistantMessage((current) => {
				const delta = startsNewStep
					? `${separatorBeforeNextStep(current.content)}${chunk.textDelta}`
					: (chunk.textDelta as string);
				return {
					...current,
					kind: "turn",
					content: `${current.content}${delta}`,
					blocks: upsertTextBlock(current.blocks ?? [], createMessageId, delta),
				};
			});
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
				ctx.updateAssistantMessage((current) =>
					// Prefer streamed deltas; only fill if empty.
					current.content.trim().length > 0
						? current
						: {
								...current,
								kind: "turn",
								content: assistantText,
								blocks: upsertTextBlock(current.blocks ?? [], createMessageId, assistantText),
							},
				);
			}
		}
	};
}
