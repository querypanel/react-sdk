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

type SetupOptions = {
	timestamp?: Date;
	sqlParams?: null;
	createMessageId?: (prefix: string) => string;
	toolEvents?: ToolEvent[];
};

function setup(opts: SetupOptions = {}) {
	let message: MastraChartMessage = {
		id: "assistant-1",
		role: "assistant",
		kind: "turn",
		content: "",
		blocks: [],
		...(opts.sqlParams !== undefined ? { sqlParams: opts.sqlParams } : {}),
		timestamp: opts.timestamp ?? new Date(),
	};
	const toolEvents: ToolEvent[] = opts.toolEvents ?? [];
	const statuses: Array<string | null> = [];
	const lastSql: { current: unknown } = { current: null };

	const handler = createMastraChartChunkHandler({
		assistantMessageId: "assistant-1",
		createMessageId: opts.createMessageId ?? ((prefix) => `${prefix}-1`),
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
		setLastSqlExecution: (artifact) => {
			lastSql.current = artifact;
		},
	});

	return {
		handler,
		toolEvents,
		statuses,
		lastSql,
		getMessage: () => message,
	};
}

describe("createMastraChartChunkHandler", () => {
	it("streams text-delta into a visible text block", () => {
		const { handler, getMessage } = setup();

		handler({ type: "text-delta", textDelta: "Revenue grew " });
		handler({ type: "text-delta", textDelta: "12%." });

		const message = getMessage();
		expect(message.content).toBe("Revenue grew 12%.");
		expect(message.blocks?.[0]).toMatchObject({
			type: "text",
			content: "Revenue grew 12%.",
			streaming: true,
		});
	});

	it("keeps parallel report charts independent and puts a late summary after them", () => {
		let n = 0;
		const { handler, getMessage } = setup({
			sqlParams: null,
			timestamp: new Date(0),
			createMessageId: (prefix) => `${prefix}-${++n}`,
		});
		const exec = (resultId: string, v: number) =>
			handler({
				type: "tool-result",
				toolName: "execute_sql",
				result: { resultId, rows: [{ v }], fields: ["v"], rowCount: 1 },
			});
		const viz = (resultId: string) =>
			handler({
				type: "tool-result",
				toolName: "generate_visualization",
				result: { resultId, spec: { kind: resultId }, sql: `select ${resultId}` },
			});

		handler({
			type: "tool-result",
			toolName: "update_plan",
			result: {
				steps: [
					{ id: "a", title: "A", status: "done" },
					{ id: "b", title: "B", status: "in_progress" },
					{ id: "c", title: "C", status: "pending" },
				],
			},
		});
		exec("r1", 1);
		exec("r2", 2);
		viz("r2");
		viz("r1");
		handler({ type: "text-delta", textDelta: "Summary." });

		const message = getMessage();
		expect(message.plan?.map((step) => step.status)).toEqual(["done", "in_progress", "pending"]);
		const blocks = message.blocks ?? [];
		expect(blocks.map((b) => b.type)).toEqual(["data", "viz", "viz", "text"]);
		const vizBlocks = blocks.filter((b) => b.type === "viz") as Array<{
			resultId?: string;
			queryResult?: { resultId?: string };
		}>;
		expect(vizBlocks.map((b) => b.resultId)).toEqual(["r2", "r1"]);
		// Each chart keeps only rows from its own execute_sql, never another chart's.
		expect(vizBlocks[1]!.queryResult).toBeUndefined();
	});

	it("starts a new paragraph for text that follows a tool result or step", () => {
		const { handler, getMessage } = setup({ sqlParams: null, timestamp: new Date(0) });

		handler({ type: "text-delta", textDelta: "First insight." });
		handler({ type: "tool-result", toolName: "update_plan", result: { steps: [] } });
		handler({ type: "text-delta", textDelta: "Second " });
		handler({ type: "text-delta", textDelta: "insight." });
		handler({ type: "step-finish" });
		handler({ type: "text-delta", textDelta: "## Summary" });

		const message = getMessage();
		expect(message.content).toBe("First insight.\n\nSecond insight.\n\n## Summary");
		expect(message.blocks?.[0]).toMatchObject({
			type: "text",
			content: "First insight.\n\nSecond insight.\n\n## Summary",
		});
	});

	it("materializes a data block from execute_sql", () => {
		const { handler, getMessage, lastSql } = setup();

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

		const message = getMessage();
		expect(message.blocks?.some((b) => b.type === "data")).toBe(true);
		expect(message.queryResult?.rowCount).toBe(2);
		expect(lastSql.current).toMatchObject({ rowCount: 2 });
	});

	it("treats a run_sql result as SQL plus data (single-LLM agent)", () => {
		const { handler, getMessage, lastSql } = setup();

		handler({
			type: "tool-result",
			toolName: "run_sql",
			result: {
				resultId: "22222222-2222-2222-2222-222222222222",
				sql: "SELECT l.title, COUNT(*) AS waiting FROM ladders l GROUP BY 1 LIMIT 100",
				rationale: "Activists waiting per ladder.",
				params: [],
				fields: ["title", "waiting"],
				rows: [{ title: "Onboarding", waiting: 2 }],
				rowCount: 1,
			},
		});

		const message = getMessage();
		expect(message.sql).toContain("GROUP BY 1");
		expect(message.rationale).toBe("Activists waiting per ladder.");
		expect(message.blocks?.some((b) => b.type === "data")).toBe(true);
		expect(lastSql.current).toMatchObject({ rowCount: 1 });
	});

	it("renders a chart carried by run_sql without a generate_visualization step", () => {
		const { handler, getMessage } = setup();

		handler({
			type: "tool-result",
			toolName: "run_sql",
			result: {
				resultId: "33333333-3333-3333-3333-333333333333",
				sql: "SELECT 1",
				fields: ["x"],
				rows: [{ x: 1 }],
				rowCount: 1,
				visualization: {
					jsonRenderSpec: { element: { type: "Chart" } },
					presentationKind: "chart",
					previewRows: [{ x: 1 }],
					fields: ["x"],
				},
			},
		});

		const message = getMessage();
		expect(message.blocks?.filter((b) => b.type === "viz")).toHaveLength(1);
		expect(message.jsonRenderSpec).toBeTruthy();
	});

	it("renders a map carried by run_sql as a viz block with the map spec and the full rows", () => {
		const { handler, getMessage } = setup();
		const spec = {
			kind: "map",
			data: { sourceId: "r" },
			encoding: { location: { mode: "place", cityField: "city" }, country: "HU", colorField: "status" },
		};

		handler({
			type: "tool-result",
			toolName: "run_sql",
			result: {
				resultId: "44444444-4444-4444-4444-444444444444",
				sql: "SELECT city, status FROM devices",
				fields: ["city", "status"],
				rows: [{ city: "Budapest", status: "active" }],
				rowCount: 1,
				visualization: { spec, jsonRenderSpec: null, presentationKind: "map" },
			},
		});

		const viz = getMessage().blocks?.find((b) => b.type === "viz");
		expect(viz?.type === "viz" && viz.chartSpec).toEqual(spec);
		expect(viz?.type === "viz" && viz.presentationKind).toBe("map");
		expect(viz?.type === "viz" && viz.queryResult?.rows).toHaveLength(1);
	});

	it("shows every run_sql chart of a turn, each with its own datasource", () => {
		let next = 0;
		const { handler, getMessage } = setup({ createMessageId: (prefix) => `${prefix}-${++next}` });
		const runSql = (resultId: string, datasourceId: string) => ({
			type: "tool-result",
			toolName: "run_sql",
			result: {
				resultId,
				sql: `SELECT ${resultId}`,
				fields: ["week", "n"],
				rows: [{ week: "2026-01-05", n: 3 }],
				rowCount: 1,
				datasource: { id: datasourceId, name: "db", dialect: "postgres" },
				visualization: {
					spec: { kind: "chart" },
					jsonRenderSpec: { element: { type: "LineChart" } },
					presentationKind: "chart",
				},
			},
		});

		handler(runSql("r1", "ds-a"));
		handler(runSql("r2", "ds-b"));

		const viz = getMessage().blocks?.filter((b) => b.type === "viz") ?? [];
		expect(viz.map((b) => b.type === "viz" && [b.resultId, b.sql, b.datasourceId])).toEqual([
			["r1", "SELECT r1", "ds-a"],
			["r2", "SELECT r2", "ds-b"],
		]);
	});

	it("adds each report chart on the datasource it ran on", () => {
		let next = 0;
		const { handler, getMessage } = setup({ createMessageId: (prefix) => `${prefix}-${++next}` });
		handler({
			type: "tool-result",
			toolName: "run_sql",
			result: {
				resultId: "r1",
				sql: "SELECT 1",
				fields: ["x", "n"],
				rows: [{ x: "a", n: 1 }],
				rowCount: 1,
				datasource: { id: "ds-a", name: "db", dialect: "postgres" },
				visualization: { spec: { kind: "chart" }, presentationKind: "chart" },
			},
		});
		const [viz] = collectDashboardReportBlocks(getMessage()).filter((b) => b.type === "viz");
		expect(viz).toMatchObject({ type: "viz", resultId: "r1", datasourceIds: ["ds-a"] });
	});

	it("does not treat Mastra output validation errors as empty SQL results", () => {
		const { handler, getMessage, toolEvents, statuses } = setup({
			toolEvents: [
				{
					id: "tool-1",
					toolName: "execute_sql",
					status: "running",
					startedAt: Date.now(),
				},
			],
		});

		handler({
			type: "tool-result",
			toolName: "execute_sql",
			result: {
				error: true,
				message: "Tool output validation failed for execute_sql",
			},
		});

		const message = getMessage();
		expect(message.blocks?.some((b) => b.type === "data")).toBe(false);
		expect(toolEvents[0]?.status).toBe("failed");
		expect(statuses.at(-1)).toBe(null);
	});

	it("keeps prior rows when a later empty execute_sql payload arrives", () => {
		const { handler, getMessage } = setup();

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

		const message = getMessage();
		expect(message.queryResult?.rowCount).toBe(1);
		expect(message.blocks?.find((b) => b.type === "data")).toMatchObject({
			type: "data",
			queryResult: { rowCount: 1 },
		});
	});

	it("marks execute_sql running only on tool-call, not tool-result", () => {
		const { handler, toolEvents, statuses } = setup();

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
		const { handler, getMessage } = setup();

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

		const message = getMessage();
		expect(message.blocks?.filter((b) => b.type === "viz")).toHaveLength(1);
		expect(message.jsonRenderSpec).toBeTruthy();
	});

	it("hydrates empty LineChart data from previewRows", () => {
		const { handler, getMessage } = setup();

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

		const message = getMessage();
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

	it("replaces the plan on each update_plan result and ignores malformed ones", () => {
		const { handler, getMessage, toolEvents } = setup({
			toolEvents: [{ id: "t1", toolName: "update_plan", status: "running", startedAt: 0 }],
		});

		handler({
			type: "tool-result",
			toolName: "update_plan",
			result: {
				steps: [
					{ id: "a", title: "Revenue", status: "in_progress" },
					{ id: "b", title: "Churn", status: "pending" },
				],
			},
		});
		expect(getMessage().plan).toHaveLength(2);
		expect(toolEvents[0]?.status).toBe("succeeded");

		handler({ type: "tool-result", toolName: "update_plan", result: { steps: [{ id: "a" }] } });
		expect(getMessage().plan).toHaveLength(2);

		handler({
			type: "tool-result",
			toolName: "update_plan",
			result: { steps: [{ id: "a", title: "Revenue", status: "done" }] },
		});
		expect(getMessage().plan).toEqual([{ id: "a", title: "Revenue", status: "done" }]);
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

	it("returns only the chosen viz blocks and no text", () => {
		const message: MastraChartMessage = {
			id: "assistant-1",
			role: "assistant",
			kind: "turn",
			content: "Summary",
			timestamp: new Date(),
			blocks: [
				{ id: "text-1", type: "text", content: "Summary" },
				{ id: "viz-1", type: "viz", chartSpec: { a: 1 }, sql: "select 1" },
				{ id: "viz-2", type: "viz", chartSpec: { b: 2 }, sql: "select 2" },
			],
		};
		const all = collectDashboardReportBlocks(message);
		expect(all.map((b) => b.type)).toEqual(["text", "viz", "viz"]);
		const picked = collectDashboardReportBlocks(message, new Set(["viz-2"]));
		expect(picked).toHaveLength(1);
		expect(picked[0]).toMatchObject({ type: "viz", sql: "select 2" });
		expect(collectDashboardReportBlocks(message, new Set())).toEqual([]);
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
