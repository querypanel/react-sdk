import { describe, expect, it } from "vitest";
import { createMastraChartChunkHandler } from "./applyMastraChartChunk";
import { completeMastraAssistantTurn, collectDashboardReportBlocks } from "./completeMastraTurn";
import { markdownToSimpleEditorBlocks } from "./markdownToBlocks";
import type { MastraChartMessage, ToolEvent } from "./types";

describe("completeMastraAssistantTurn", () => {
	it("synthesizes an ask when the turn has data but no text or viz", () => {
		const message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			timestamp: new Date(),
			blocks: [
				{
					id: "data-1",
					type: "data",
					queryResult: {
						fields: ["country"],
						rows: [{ country: "US" }],
						rowCount: 12,
					},
				},
			],
			queryResult: {
				fields: ["country"],
				rows: [{ country: "US" }],
				rowCount: 12,
			},
		};

		const completed = completeMastraAssistantTurn(message, (prefix) => `${prefix}-x`);
		expect(completed.blocks?.some((b) => b.type === "ask")).toBe(true);
		const ask = completed.blocks?.find((b) => b.type === "ask");
		expect(ask?.type === "ask" && ask.content).toContain("12");
		expect(ask?.type === "ask" && ask.content).toMatch(/chart|table|breakdown/i);
	});

	it("does not add ask when viz already exists", () => {
		const message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			timestamp: new Date(),
			blocks: [
				{
					id: "viz-1",
					type: "viz",
					jsonRenderSpec: { root: "Chart" },
				},
			],
		};

		const completed = completeMastraAssistantTurn(message);
		expect(completed.blocks?.some((b) => b.type === "ask")).toBe(false);
	});
});

describe("createMastraChartChunkHandler", () => {
	it("streams text-delta into a visible text block", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};
		const toolEvents: ToolEvent[] = [];

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: () => {},
			setToolEvents: (updater) => {
				toolEvents.splice(0, toolEvents.length, ...updater(toolEvents));
			},
			setLastSqlExecution: () => {},
		});

		handler({ type: "text-delta", textDelta: "Revenue grew " });
		handler({ type: "text-delta", textDelta: "12%." });

		expect(message.content).toBe("Revenue grew 12%.");
		expect(message.blocks?.[0]).toMatchObject({
			type: "text",
			content: "Revenue grew 12%.",
			streaming: true,
		});
	});

	it("materializes a data block from execute_sql", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};
		const lastSql: { current: unknown } = { current: null };

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: () => {},
			setToolEvents: () => {},
			setLastSqlExecution: (artifact) => {
				lastSql.current = artifact;
			},
		});

		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: {
				resultId: "11111111-1111-1111-1111-111111111111",
				fields: ["x"],
				rows: [{ x: 1 }, { x: 2 }],
				rowCount: 2,
			},
		});

		expect(message.blocks?.some((b) => b.type === "data")).toBe(true);
		expect(message.queryResult?.rowCount).toBe(2);
		expect(lastSql.current).toMatchObject({ rowCount: 2 });
	});

	it("does not treat Mastra output validation errors as empty SQL results", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};
		const toolEvents: ToolEvent[] = [
			{
				id: "tool-1",
				toolName: "execute_sql",
				status: "running",
				startedAt: Date.now(),
			},
		];
		const statuses: Array<string | null> = [];

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: (status) => {
				statuses.push(status);
			},
			setToolEvents: (updater) => {
				toolEvents.splice(0, toolEvents.length, ...updater(toolEvents));
			},
			setLastSqlExecution: () => {},
		});

		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: {
				error: true,
				message: "Tool output validation failed for execute_sql",
			},
		});

		expect(message.blocks?.some((b) => b.type === "data")).toBe(false);
		expect(toolEvents[0]?.status).toBe("failed");
		expect(statuses.at(-1)).toBe(null);
	});

	it("keeps prior rows when a later empty execute_sql payload arrives", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: () => {},
			setToolEvents: () => {},
			setLastSqlExecution: () => {},
		});

		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: {
				fields: ["x"],
				rows: [{ x: 1 }],
				rowCount: 1,
			},
		});
		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: {
				fields: [],
				rows: [],
				rowCount: 0,
			},
		});

		expect(message.queryResult?.rowCount).toBe(1);
		expect(message.blocks?.find((b) => b.type === "data")).toMatchObject({
			type: "data",
			queryResult: { rowCount: 1 },
		});
	});

	it("marks execute_sql running only on tool-call, not tool-result", () => {
		const toolEvents: ToolEvent[] = [];
		const statuses: Array<string | null> = [];

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: () => {},
			setTransientStatus: (status) => {
				statuses.push(status);
			},
			setToolEvents: (updater) => {
				toolEvents.splice(0, toolEvents.length, ...updater(toolEvents));
			},
			setLastSqlExecution: () => {},
		});

		handler({ type: "tool-call", toolName: "execute_sql" });
		expect(toolEvents).toHaveLength(1);
		expect(toolEvents[0]?.status).toBe("running");
		expect(statuses.at(-1)).toBe("Running SQL");

		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: { fields: ["x"], rows: [{ x: 1 }], rowCount: 1 },
		});
		expect(toolEvents[0]?.status).toBe("succeeded");
	});

	it("appends a viz block from generate_visualization", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: () => {},
			setToolEvents: () => {},
			setLastSqlExecution: () => {},
		});

		handler({
			type: "tool-result",
			toolName: "generate_visualization",
			result: {
				jsonRenderSpec: { element: { type: "Chart" } },
				presentationKind: "chart",
				sql: "SELECT 1",
				params: { "1": 1 },
			},
		});

		expect(message.blocks?.filter((b) => b.type === "viz")).toHaveLength(1);
		expect(message.jsonRenderSpec).toBeTruthy();
	});

	it("hydrates empty LineChart data from previewRows", () => {
		let message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "",
			blocks: [],
			timestamp: new Date(),
		};

		const handler = createMastraChartChunkHandler({
			assistantMessageId: "assistant-1",
			createMessageId: (prefix) => `${prefix}-1`,
			updateAssistantMessage: (updates) => {
				message =
					typeof updates === "function"
						? updates(message)
						: { ...message, ...updates };
			},
			setTransientStatus: () => {},
			setToolEvents: () => {},
			setLastSqlExecution: () => {},
		});

		handler({
			type: "tool-result",
			toolName: "generate_visualization",
			result: {
				resultId: "11111111-1111-1111-1111-111111111111",
				presentationKind: "chart",
				fields: [
					"signup_week",
					"weekly_signed_up_users",
					"cumulative_signed_up_users",
				],
				previewRows: [
					{
						signup_week: "2026-05-11T00:00:00.000Z",
						weekly_signed_up_users: 3,
						cumulative_signed_up_users: 3,
					},
					{
						signup_week: "2026-05-18T00:00:00.000Z",
						weekly_signed_up_users: 7,
						cumulative_signed_up_users: 10,
					},
				],
				jsonRenderSpec: {
					root: "c1",
					elements: {
						c1: {
							type: "LineChart",
							props: {
								title: "Accumulated Signed-Up Users by Week",
								data: [],
								labelField: "signup_week",
								valueField: "cumulative_signed_up_users",
								resultId: "11111111-1111-1111-1111-111111111111",
							},
							children: [],
						},
					},
				},
			},
		});

		const viz = message.blocks?.find((b) => b.type === "viz");
		expect(viz).toBeTruthy();
		const spec = viz && viz.type === "viz" ? viz.jsonRenderSpec : null;
		const root = (spec as { root: string; elements: Record<string, { props: { data: unknown } }> })
			?.elements?.c1;
		expect(root?.props.data).toEqual([
			{ label: "2026-05-11T00:00:00.000Z", value: 3 },
			{ label: "2026-05-18T00:00:00.000Z", value: 10 },
		]);
	});
});

describe("collectDashboardReportBlocks", () => {
	it("collects text and viz for dashboard insert", () => {
		const blocks = collectDashboardReportBlocks({
			id: "a",
			role: "assistant",
			kind: "turn",
			content: "",
			timestamp: new Date(),
			blocks: [
				{ id: "t", type: "text", content: "# Overview\n\nRevenue is up." },
				{
					id: "v",
					type: "viz",
					jsonRenderSpec: { element: { type: "Chart" } },
					sql: "SELECT 1",
				},
			],
		});

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({ type: "text" });
		expect(blocks[1]).toMatchObject({ type: "viz", sql: "SELECT 1" });
	});
});

describe("markdownToSimpleEditorBlocks", () => {
	it("splits headings and paragraphs", () => {
		const blocks = markdownToSimpleEditorBlocks("# Title\n\nBody line\n\n## Section\nMore");
		expect(blocks).toEqual([
			{ type: "heading", level: 1, text: "Title" },
			{ type: "paragraph", text: "Body line" },
			{ type: "heading", level: 2, text: "Section" },
			{ type: "paragraph", text: "More" },
		]);
	});
});
