"use client";

import type { ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LoaderCircleIcon } from "lucide-react";
import { PersistedSpecRenderer } from "../generative-ui/PersistedSpecRenderer";
import {
	hasInlineJsonRenderData,
	hydrateJsonRenderSpecFromRows,
} from "../generative-ui/specData";
import { formatToolStatus } from "./mastraChartStream";
import type {
	MastraChartMessage,
	ReportBlock,
	ReportVizBlock,
	SqlExecutionArtifact,
	ToolEvent,
} from "./types";

const DATA_PREVIEW_ROW_LIMIT = 8;

function AssistantMessageMarkdown({ content }: { content: string }) {
	return (
		<div className="qp-ai-modal-md">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
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

function VizPreview({
	block,
	queryResultBaseUrl,
	requestHeaders,
	fallbackRows,
	ChartPreview,
	withVizSpecDataFallback,
	darkMode,
}: {
	block: ReportVizBlock;
	queryResultBaseUrl?: string;
	requestHeaders?: Record<string, string>;
	fallbackRows: Array<Record<string, unknown>> | null;
	ChartPreview: ComponentType<{
		chartSpec: unknown;
		darkMode?: boolean;
	}>;
	withVizSpecDataFallback: (
		chartSpec: unknown,
		rows: Array<Record<string, unknown>> | null,
	) => unknown;
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
					<ChartPreview
						chartSpec={withVizSpecDataFallback(block.chartSpec, rows)}
						darkMode={darkMode}
					/>
				)}
			</div>
		</div>
	);
}

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
	ChartPreview,
	withVizSpecDataFallback,
	ThoughtSummaryRail,
	onAddViz,
	onAddReport,
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
	ChartPreview: ComponentType<{
		chartSpec: unknown;
		darkMode?: boolean;
	}>;
	withVizSpecDataFallback: (
		chartSpec: unknown,
		rows: Array<Record<string, unknown>> | null,
	) => unknown;
	ThoughtSummaryRail: ComponentType<{ events: ToolEvent[] }>;
	onAddViz: (block: ReportVizBlock) => void;
	onAddReport: (message: MastraChartMessage) => void;
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

			{blocks.map((block) => {
				if (block.type === "text") {
					return (
						<div key={block.id} className="qp-ai-modal-report-text">
							<AssistantMessageMarkdown content={block.content} />
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
					return (
						<div key={block.id} className="qp-ai-modal-report-viz">
							<VizPreview
								block={block}
								queryResultBaseUrl={queryResultBaseUrl}
								requestHeaders={requestHeaders}
								fallbackRows={fallbackRows}
								ChartPreview={ChartPreview}
								withVizSpecDataFallback={withVizSpecDataFallback}
								darkMode={darkMode}
							/>
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
					<AssistantMessageMarkdown content={message.content} />
					{isActive && isLoading ? (
						<span className="qp-ai-modal-stream-caret" aria-hidden>
							|
						</span>
					) : null}
				</div>
			)}

			{!isLoading && canAddReport && (
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
