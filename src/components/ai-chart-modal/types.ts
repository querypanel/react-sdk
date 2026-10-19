export type ToolEventStatus = "running" | "succeeded" | "failed";

export type ToolEvent = {
	id: string;
	toolName: string;
	status: ToolEventStatus;
	startedAt: number;
	endedAt?: number;
	error?: string;
};

export type SqlExecutionArtifact = {
	resultId?: string;
	fields: string[];
	rows: Array<Record<string, unknown>>;
	rowCount: number;
	database?: string;
	dialect?: string;
	datasource?: { id: string; name: string; dialect: string };
};

/** Progressive blocks on a Mastra assistant turn (report-style chat). */
export type ReportTextBlock = {
	id: string;
	type: "text";
	content: string;
	streaming?: boolean;
};

export type ReportDataBlock = {
	id: string;
	type: "data";
	queryResult: SqlExecutionArtifact;
};

export type ReportVizBlock = {
	id: string;
	type: "viz";
	chartSpec?: unknown;
	jsonRenderSpec?: unknown;
	resultId?: string;
	presentationKind?: "chart" | "table" | "metric";
	sql?: string;
	sqlParams?: Record<string, unknown> | null;
	queryResult?: SqlExecutionArtifact;
	rationale?: string;
};

export type ReportAskBlock = {
	id: string;
	type: "ask";
	content: string;
};

export type ReportBlock =
	| ReportTextBlock
	| ReportDataBlock
	| ReportVizBlock
	| ReportAskBlock;

/** Payload for inserting a report into the BlockNote dashboard editor. */
export type DashboardReportInsertBlock =
	| {
			type: "text";
			markdown: string;
	  }
	| {
			type: "viz";
			chartSpec?: unknown;
			jsonRenderSpec?: unknown;
			rationale?: string;
			/** Original NL question used when modifying the pinned chart. */
			question?: string;
			sql?: string;
			sqlParams?: Record<string, unknown> | null;
			resultId?: string;
			presentationKind?: "chart" | "table" | "metric";
			datasourceIds?: string[];
			tenantFieldName?: string;
			previewTenantId?: string;
	  };

export type MastraChartMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	/** Mastra stream turns use `turn`; classic generate-chart replies omit `kind`. */
	kind?: "turn";
	sourceAssistantId?: string;
	chartSpec?: unknown;
	jsonRenderSpec?: unknown;
	resultId?: string;
	presentationKind?: "chart" | "table" | "metric";
	queryResult?: SqlExecutionArtifact;
	rationale?: string;
	sql?: string;
	sqlParams?: Record<string, unknown> | null;
	timestamp: Date;
	toolEvents?: ToolEvent[];
	/** Progressive report blocks for Mastra stream turns. */
	blocks?: ReportBlock[];
};
