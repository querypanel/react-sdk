"use client";

import type { ComponentType, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LoaderCircleIcon } from "lucide-react";
import { PersistedSpecRenderer } from "../generative-ui/PersistedSpecRenderer";
import {
	hasInlineJsonRenderData,
	hydrateJsonRenderSpecFromRows,
} from "../generative-ui/specData";
import { formatToolStatus } from "./mastraChartStream";
import { PlanChecklist } from "./PlanChecklist";
import { withDerivedPlanProgress } from "./planProgress";
import { VizSpecPreview } from "./VizSpecPreview";
import { ChartChip } from "./ChartTagUi";
import { CHART_REF_HREF_PREFIX, linkifyChartRefs } from "../workspaceState";
import type {
	MastraChartMessage,
	ReportBlock,
	ReportVizBlock,
	SqlExecutionArtifact,
	ToolEvent,
} from "./types";

const DATA_PREVIEW_ROW_LIMIT = 8;

/** How a `[↗ cN]` citation in an answer renders and behaves. */
export type ChartRefResolver = (ref: string) => {
	label: string;
	removed: boolean;
	onClick?: () => void;
};

function AssistantMessageMarkdown({
	content,
	resolveChartRef,
}: {
	content: string;
	resolveChartRef?: ChartRefResolver;
}) {
	return (
		<div className="qp-ai-modal-md">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={
					resolveChartRef
						? {
								a: ({ href, children, ...rest }) => {
									if (href?.startsWith(CHART_REF_HREF_PREFIX)) {
										const resolved = resolveChartRef(href.slice(CHART_REF_HREF_PREFIX.length));
										return (
											<ChartChip
												label={`↗ ${resolved.label}`}
												dead={resolved.removed}
												onClick={resolved.onClick}
											/>
										);
									}
									return (
										<a href={href} {...rest}>
											{children}
										</a>
									);
								},
							}
						: undefined
				}
			>
				{resolveChartRef ? linkifyChartRefs(content) : content}
			</ReactMarkdown>
		</div>
	);
}

function DataPreviewTable({ queryResult }: { queryResult: SqlExecutionArtifact }) {
	const fields =
		queryResult.fields.length > 0
			? queryResult.fields
			: queryResult.rows[0]
				? Object.keys(queryResult.rows[0])
				: [];
	const previewRows = queryResult.rows.slice(0, DATA_PREVIEW_ROW_LIMIT);

	return (
		<div className="qp-ai-modal-data-preview">
			<div className="qp-ai-modal-data-preview-meta">
				{queryResult.rowCount.toLocaleString()} row
				{queryResult.rowCount === 1 ? "" : "s"}
				{queryResult.rows.length > DATA_PREVIEW_ROW_LIMIT
					? ` · showing first ${DATA_PREVIEW_ROW_LIMIT}`
					: ""}
			</div>
			{fields.length > 0 && previewRows.length > 0 ? (
				<div className="qp-ai-modal-data-preview-scroll">
					<table className="qp-ai-modal-data-preview-table">
						<thead>
							<tr>
								{fields.map((field) => (
									<th key={field}>{field}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{previewRows.map((row, rowIndex) => (
								<tr key={rowIndex}>
									{fields.map((field) => (
										<td key={field}>
											{row[field] === null || row[field] === undefined
												? "—"
												: String(row[field])}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="qp-ai-modal-data-preview-empty">No rows to preview.</p>
			)}
		</div>
	);
}

export function VizPreview({
	block,
	queryResultBaseUrl,
	requestHeaders,
	fallbackRows,
	datasourceCount,
	darkMode,
}: {
	block: ReportVizBlock;
	queryResultBaseUrl?: string;
	requestHeaders?: Record<string, string>;
	fallbackRows: Array<Record<string, unknown>> | null;
	datasourceCount?: number;
	darkMode?: boolean;
}) {
	const rows =
		Array.isArray(block.queryResult?.rows) && block.queryResult.rows.length > 0
			? (block.queryResult.rows as Array<Record<string, unknown>>)
			: fallbackRows;
	const fields =
		Array.isArray(block.queryResult?.fields) && block.queryResult.fields.length > 0
			? block.queryResult.fields
			: rows?.[0]
				? Object.keys(rows[0])
				: [];

	const hydratedJsonRenderSpec =
		block.jsonRenderSpec &&
		rows &&
		rows.length > 0 &&
		!hasInlineJsonRenderData(block.jsonRenderSpec)
			? hydrateJsonRenderSpecFromRows(block.jsonRenderSpec, rows, fields)
			: block.jsonRenderSpec;

	return (
		<div className="qp-ai-modal-chart-stack">
			<div className="qp-ai-modal-chart-stack-preview">
				{hydratedJsonRenderSpec ? (
					<div className="qp-ai-modal-chart-preview">
						<PersistedSpecRenderer
							spec={hydratedJsonRenderSpec}
							queryResultBaseUrl={queryResultBaseUrl}
							requestHeaders={requestHeaders}
						/>
					</div>
				) : (
					<VizSpecPreview
						chartSpec={block.chartSpec}
						fallbackRows={rows}
						darkMode={darkMode}
						datasourceCount={datasourceCount}
					/>
				)}
			</div>
		</div>
	);
}

/** Per-chart checkbox + "Added" state for report turns with several charts. */
export type VizSelection = {
	isSelected: (vizId: string) => boolean;
	isAdded: (vizId: string) => boolean;
	onToggle: (vizId: string) => void;
	/** Insert only these charts (no text). */
	onAddSelected: (vizIds: string[]) => void;
	/** Card heading for a chart. */
	getTitle: (block: ReportVizBlock) => string | undefined;
};

export function ReportTurnView({
	message,
	isActive,
	isLoading,
	toolEvents,
	transientStatus,
	lastSqlExecution,
	queryResultBaseUrl,
	requestHeaders,
	darkMode,
	datasourceCount,
	ThoughtSummaryRail,
	onAddViz,
	onAddReport,
	resolveChartRef,
	renderVizBlock,
	selection,
	hidePlan = false,
}: {
	message: MastraChartMessage;
	isActive: boolean;
	isLoading: boolean;
	toolEvents: ToolEvent[];
	transientStatus: string | null;
	lastSqlExecution: SqlExecutionArtifact | null;
	queryResultBaseUrl?: string;
	requestHeaders?: Record<string, string>;
	darkMode?: boolean;
	datasourceCount?: number;
	ThoughtSummaryRail: ComponentType<{ events: ToolEvent[] }>;
	onAddViz: (block: ReportVizBlock) => void;
	onAddReport: (message: MastraChartMessage) => void;
	/** When set, `[↗ cN]` citations in answer text render as chart chips. */
	resolveChartRef?: ChartRefResolver;	/**
	 * Replace the default viz block (preview + "Add to dashboard"), e.g. with a before/after card
	 * for a tagged chart. `preview` is the default preview of the proposed chart. Return null to
	 * keep the default.
	 */
	renderVizBlock?: (block: ReportVizBlock, preview: ReactNode) => ReactNode | null;
	/** When set, each chart renders as a selectable card with an "Add selected" footer. */
	selection?: VizSelection;
	/** The host pins this turn's plan above the composer, so do not repeat it inline. */
	hidePlan?: boolean;
}) {
	const liveTools = isActive && isLoading ? toolEvents : [];
	const finishedTools = message.toolEvents ?? [];
	const blocks: ReportBlock[] = message.blocks ?? [];
	const vizBlocks = blocks.filter((b): b is ReportVizBlock => b.type === "viz");
	const hasViz = vizBlocks.length > 0;
	const canAddReport =
		hasViz ||
		blocks.some((b) => b.type === "text" && b.content.trim().length > 0) ||
		Boolean(message.jsonRenderSpec || message.chartSpec);

	const pendingSelectedIds = selection
		? vizBlocks
				.filter((b) => selection.isSelected(b.id) && !selection.isAdded(b.id))
				.map((b) => b.id)
		: [];

	const fallbackRows =
		Array.isArray(message.queryResult?.rows) && message.queryResult.rows.length > 0
			? (message.queryResult.rows as Array<Record<string, unknown>>)
			: isActive
				? (lastSqlExecution?.rows ?? null)
				: null;

	return (
		<div className="qp-ai-modal-report-turn">
			{isActive && isLoading && liveTools.length === 0 && (
				<div className="qp-ai-modal-toolrail" aria-live="polite" aria-label="Assistant status">
					<span className="qp-ai-modal-step-text">
						<LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
						{transientStatus ?? "Thinking"}
					</span>
				</div>
			)}

			{isActive && isLoading && liveTools.some((e) => e.status === "running") && (
				<div className="qp-ai-modal-toolrail" aria-label="Agent steps">
					{liveTools
						.filter((event) => event.status === "running")
						.map((event) => (
							<span key={event.id} className="qp-ai-modal-step-text">
								<LoaderCircleIcon className="w-3 h-3 qp-ai-modal-spin" />
								{formatToolStatus(event.toolName)}
							</span>
						))}
				</div>
			)}

			{!isLoading && finishedTools.length > 0 && (
				<ThoughtSummaryRail events={finishedTools} />
			)}

			{!hidePlan && message.plan && message.plan.length > 0 && (
				<PlanChecklist
					steps={withDerivedPlanProgress(
						message.plan,
						blocks.filter((block) => block.type === "viz").length,
						isActive && isLoading,
					)}
					stopped={!(isActive && isLoading)}
				/>
			)}

			{blocks.map((block) => {
				if (block.type === "text") {
					// An empty text block (e.g. before the first token) would only add a gap.
					if (!block.content.trim() && !(block.streaming && isActive && isLoading)) return null;
					return (
						<div key={block.id} className="qp-ai-modal-report-text">
							<AssistantMessageMarkdown content={block.content} resolveChartRef={resolveChartRef} />
							{block.streaming && isActive && isLoading ? (
								<span className="qp-ai-modal-stream-caret" aria-hidden>
									|
								</span>
							) : null}
						</div>
					);
				}

				// Chart carries the series; keep the SQL preview only when there is no viz yet.
				if (block.type === "data") {
					if (hasViz) {
						return null;
					}
					return (
						<div key={block.id} className="qp-ai-modal-report-data">
							<DataPreviewTable queryResult={block.queryResult} />
						</div>
					);
				}

				if (block.type === "viz") {
					const preview = (
						<VizPreview
							block={block}
							queryResultBaseUrl={queryResultBaseUrl}
							requestHeaders={requestHeaders}
							fallbackRows={fallbackRows}
							datasourceCount={datasourceCount}
							darkMode={darkMode}
						/>
					);
					const custom = renderVizBlock?.(block, preview) ?? null;
					if (custom) {
						return (
							<div key={block.id} className="qp-ai-modal-report-viz">
								{custom}
							</div>
						);
					}
					if (selection) {
						const added = selection.isAdded(block.id);
						const title = selection.getTitle(block);
						return (
							<div key={block.id} className="qp-ai-modal-report-viz qp-ai-modal-report-card">
								<div className="qp-ai-modal-report-card-head">
									<label className="qp-ai-modal-report-card-pick">
										<input
											type="checkbox"
											checked={added || selection.isSelected(block.id)}
											disabled={added}
											onChange={() => selection.onToggle(block.id)}
										/>
										<span className="qp-ai-modal-report-card-title">{title || "Chart"}</span>
									</label>
									<button
										type="button"
										disabled={added}
										onClick={() => onAddViz(block)}
										className="qp-ai-modal-report-card-add"
									>
										{added ? "Added \u2713" : "Add to dashboard"}
									</button>
								</div>
								{block.rationale ? (
									<p className="qp-ai-modal-report-card-caption">{block.rationale}</p>
								) : null}
								{preview}
							</div>
						);
					}
					return (
						<div key={block.id} className="qp-ai-modal-report-viz">
							{preview}
							<div className="qp-ai-modal-chart-action-item">
								<button
									type="button"
									onClick={() => onAddViz(block)}
									className="qp-ai-modal-add-chart-btn"
								>
									Add to dashboard
								</button>
							</div>
						</div>
					);
				}

				if (block.type === "ask") {
					return (
						<div key={block.id} className="qp-ai-modal-report-ask">
							<AssistantMessageMarkdown content={block.content} />
						</div>
					);
				}

				return null;
			})}

			{/* Fallback when content exists on the message but not yet as blocks */}
			{blocks.length === 0 && message.content.trim().length > 0 && (
				<div className="qp-ai-modal-report-text">
					<AssistantMessageMarkdown content={message.content} resolveChartRef={resolveChartRef} />
					{isActive && isLoading ? (
						<span className="qp-ai-modal-stream-caret" aria-hidden>
							|
						</span>
					) : null}
				</div>
			)}

			{selection && canAddReport && (
				<div className="qp-ai-modal-report-actions qp-ai-modal-report-actions-sticky">
					<button
						type="button"
						disabled={isLoading || pendingSelectedIds.length === 0}
						onClick={() => selection.onAddSelected(pendingSelectedIds)}
						className="qp-ai-modal-add-chart-btn"
					>
						Add selected ({pendingSelectedIds.length})
					</button>
					<button
						type="button"
						disabled={isLoading}
						onClick={() => onAddReport(message)}
						className="qp-ai-modal-add-report-btn"
					>
						Add report to dashboard
					</button>
				</div>
			)}

			{!selection && !isLoading && canAddReport && (
				<div className="qp-ai-modal-report-actions">
					<button
						type="button"
						onClick={() => onAddReport(message)}
						className="qp-ai-modal-add-report-btn"
					>
						Add report to dashboard
					</button>
				</div>
			)}
		</div>
	);
}
