import type {
	DashboardReportInsertBlock,
	MastraChartMessage,
	ReportAskBlock,
	ReportBlock,
	ReportTextBlock,
} from "./types";

const DEFAULT_ASK =
	"Want a chart, table, or a fuller breakdown of this data?";

function hasVisibleText(blocks: ReportBlock[] | undefined): boolean {
	return Boolean(
		blocks?.some(
			(block) =>
				(block.type === "text" || block.type === "ask") &&
				block.content.trim().length > 0,
		),
	);
}

function hasViz(blocks: ReportBlock[] | undefined): boolean {
	return Boolean(
		blocks?.some(
			(block) =>
				block.type === "viz" &&
				Boolean(block.jsonRenderSpec || block.chartSpec),
		),
	);
}

function hasAsk(blocks: ReportBlock[] | undefined): boolean {
	return Boolean(blocks?.some((block) => block.type === "ask"));
}

function synthesizeAskContent(message: MastraChartMessage): string {
	const failed = message.toolEvents?.find((event) => event.status === "failed");
	if (failed?.error) {
		return `Something went wrong while ${failed.toolName.replace(/_/g, " ")}: ${failed.error}. Want to try again with a different question?`;
	}

	const dataBlock = message.blocks?.find((block) => block.type === "data");
	const rowCount =
		dataBlock?.type === "data"
			? dataBlock.queryResult.rowCount
			: message.queryResult?.rowCount;

	if (typeof rowCount === "number") {
		if (rowCount === 0) {
			return "No rows matched those filters. Want me to widen the date range or try different filters?";
		}
		return `Ran the query — ${rowCount.toLocaleString()} row${rowCount === 1 ? "" : "s"}. ${DEFAULT_ASK}`;
	}

	if (message.content.trim().length > 0) {
		return message.content.trim();
	}

	return `I finished processing your request. ${DEFAULT_ASK}`;
}

/**
 * Ensures a Mastra assistant turn always ends with visible text, a viz, or an ask.
 * Mutates nothing — returns an updated message.
 */
export function completeMastraAssistantTurn(
	message: MastraChartMessage,
	createBlockId: (prefix: string) => string = (prefix) => `${prefix}-${Date.now()}`,
): MastraChartMessage {
	const blocks: ReportBlock[] = (message.blocks ?? []).map((block) => {
		if (block.type !== "text") return block;
		const next: ReportTextBlock = { ...block, streaming: false };
		return next;
	});

	const contentFromText = blocks
		.filter((block): block is ReportTextBlock => block.type === "text")
		.map((block) => block.content)
		.join("\n\n")
		.trim();

	const nextContent =
		message.content.trim().length > 0 ? message.content : contentFromText;

	if (hasViz(blocks) || hasVisibleText(blocks) || hasAsk(blocks)) {
		return {
			...message,
			kind: "turn",
			blocks,
			content: nextContent,
		};
	}

	// Also accept top-level viz fields (legacy / non-block path).
	if (message.jsonRenderSpec || message.chartSpec) {
		return {
			...message,
			kind: "turn",
			blocks,
			content:
				nextContent ||
				(message.presentationKind === "table"
					? "I've prepared a table for you."
					: "I've prepared a visualization for you."),
		};
	}

	const askContent = synthesizeAskContent({ ...message, blocks, content: nextContent });
	const askBlock: ReportAskBlock = {
		id: createBlockId("ask"),
		type: "ask",
		content: askContent,
	};

	return {
		...message,
		kind: "turn",
		blocks: [...blocks, askBlock],
		content: nextContent || askContent,
	};
}

/** Collect insertable report sections from a completed turn. */
export function collectDashboardReportBlocks(
	message: MastraChartMessage,
	/** When set, return only these viz blocks (no text), in turn order. */
	onlyVizIds?: ReadonlySet<string>,
): DashboardReportInsertBlock[] {
	const out: DashboardReportInsertBlock[] = [];
	const blocks = message.blocks ?? [];

	for (const block of blocks) {
		if (onlyVizIds && !(block.type === "viz" && onlyVizIds.has(block.id))) continue;
		if (block.type === "text" && block.content.trim().length > 0) {
			out.push({ type: "text", markdown: block.content.trim() });
		}
		if (block.type === "viz" && (block.jsonRenderSpec || block.chartSpec)) {
			out.push({
				type: "viz",
				chartSpec: block.chartSpec,
				jsonRenderSpec: block.jsonRenderSpec,
				rationale: block.rationale,
				sql: block.sql ?? message.sql,
				sqlParams: block.sqlParams ?? message.sqlParams ?? null,
				resultId: block.resultId ?? message.resultId,
				presentationKind: block.presentationKind,
			});
		}
	}

	if (onlyVizIds) return out;

	// Legacy single-viz on the message itself.
	const hasVizBlock = out.some((b) => b.type === "viz");
	if (!hasVizBlock && (message.jsonRenderSpec || message.chartSpec)) {
		const vizBlock: DashboardReportInsertBlock = {
			type: "viz",
			chartSpec: message.chartSpec,
			jsonRenderSpec: message.jsonRenderSpec,
			rationale: message.rationale,
			sql: message.sql,
			sqlParams: message.sqlParams ?? null,
			resultId: message.resultId,
			presentationKind: message.presentationKind,
		};
		out.push(vizBlock);
	}

	const hasTextBlock = out.some((b) => b.type === "text");
	if (!hasTextBlock && message.content.trim().length > 0) {
		const generic =
			message.content === "I've prepared a visualization for you." ||
			message.content === "I've prepared a table for you." ||
			message.content === "I processed your request.";
		if (!generic) {
			const textBlock: DashboardReportInsertBlock = {
				type: "text",
				markdown: message.content.trim(),
			};
			out.unshift(textBlock);
		}
	}

	return out;
}
