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

export type MastraChartMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	kind?: "status" | "chart" | "action" | "explanation";
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
};
