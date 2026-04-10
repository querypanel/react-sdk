import "../helpers/config.helper";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const mockGenerateObject = mock(async () => ({
	object: {
		sql: "SELECT passenger_id FROM passenger WHERE tenant_id = @tenant_id",
		params: [],
		rationale: "Use the passenger table.",
	},
}));

const mockGetDatasourceForOrg = mock(async () => ({
	id: "ds_1",
	name: "Analytics Warehouse",
	dialect: "bigquery",
	database_name: "analytics",
	bigquery_dataset_project_id: "test-project",
	tenant_field_name: "tenant_id",
	tenant_field_type: "String",
}));

const mockQueryRunnerRun = mock(async () => ({
	sql: "SELECT should_not_be_called",
}));

const mockExecuteEmbeddedSql = mock(async () => ({
	execution: {
		rows: [{ passenger_count: 42 }],
		fields: ["passenger_count"],
	},
	embed: {},
	databaseName: "analytics",
}));

const mockGenerateVizspecWithRetry = mock(async () => ({
	spec: {
		version: "1.0",
		kind: "chart",
		title: null,
		description: null,
		data: { sourceId: "main_query" },
		encoding: {
			chartType: "bar",
			x: null,
			y: null,
			series: null,
			stacking: null,
			sort: null,
			limit: null,
			tooltips: null,
		},
	},
	notes: null,
}));

mock.module("ai", () => ({
	generateObject: mockGenerateObject,
}));

mock.module("@ai-sdk/openai", () => ({
	openai: mock(() => "mock-model"),
}));

mock.module("../../src/services/embedded-querypanel-sdk.service", () => ({
	executeEmbeddedSql: mockExecuteEmbeddedSql,
}));

afterAll(() => {
	// Avoid leaking module mocks into other test files.
	mock.restore();

	// Restore global Mastra runtime deps mutated in this file.
	const runtime = getMastraRuntime() as any;
	runtime.datasourceService = originalRuntimeDeps.datasourceService;
	runtime.hybridRetriever = originalRuntimeDeps.hybridRetriever;
	runtime.queryRunnerV2 = originalRuntimeDeps.queryRunnerV2;
	runtime.vizspecGenerator = originalRuntimeDeps.vizspecGenerator;
});

import {
	buildAuthContext,
	executeSqlTool,
	generateVisualizationTool,
	generateSqlTool,
	resolveDatasourceId,
	searchSchemaTool,
} from "../../src/mastra/tools/sql-agent-tools";
import { getMastraRuntime } from "../../src/mastra/runtime";

const originalRuntimeDeps = (() => {
	const runtime = getMastraRuntime() as any;
	return {
		datasourceService: runtime.datasourceService,
		hybridRetriever: runtime.hybridRetriever,
		queryRunnerV2: runtime.queryRunnerV2,
		vizspecGenerator: runtime.vizspecGenerator,
	};
})();

describe("generateSqlTool", () => {
	beforeEach(() => {
		mockGenerateObject.mockClear();
		mockGetDatasourceForOrg.mockClear();
		mockQueryRunnerRun.mockClear();
		mockExecuteEmbeddedSql.mockClear();
		mockGenerateVizspecWithRetry.mockClear();

		// Ensure tool runtime dependencies are mocked without module-mocking the runtime.
		const runtime = getMastraRuntime() as any;
		runtime.datasourceService = { getDatasourceForOrg: mockGetDatasourceForOrg };
		runtime.hybridRetriever = {
			retrieveTwoPass: mock(async () => ({
				chunks: [],
				primaryTable: "passenger",
				database: "analytics",
				dialect: "bigquery",
				tenantSettings: null,
			})),
		};
		runtime.queryRunnerV2 = { run: mockQueryRunnerRun };
		runtime.vizspecGenerator = { generateWithRetry: mockGenerateVizspecWithRetry };
	});

	test("uses explicit schema context and bypasses queryRunnerV2", async () => {
		const result = await (generateSqlTool as any).execute(
			{
				question: "list passengers",
				contextChunks: [
					{
						source: "table_overview",
						pageContent: "passenger columns: passenger_id, tenant_id",
						metadata: {
							table: "passenger",
						},
					},
				],
				dialect: "bigquery",
			},
			{
				requestContext: new Map([
					["organizationId", "org_1"],
					["tenantId", "tenant-123"],
					["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
				]),
			},
		);

		expect(mockGenerateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining(
					"passenger columns: passenger_id, tenant_id",
				),
			}),
		);
		expect(mockQueryRunnerRun).not.toHaveBeenCalled();
		expect(result.sql).toContain("LIMIT 100");
		expect(result.params).toEqual([
			{
				name: "tenant_id",
				value: "tenant-123",
				description: "Tenant isolation filter",
			},
		]);
		expect(result.database).toBe("analytics");
		expect("trace" in result).toBe(false);
		expect("queryId" in result).toBe(false);
		expect("intent" in result).toBe(false);
	});

	test("prefers requestContext identity values over conflicting tool input", async () => {
		const requestContext = new Map([
			["organizationId", "149c3cc2-7f9e-49d0-950d-9a84aa3dd76c"],
			["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
			["tenantId", "1"],
		]);

		const auth = buildAuthContext(
			{
				organizationId: "org_123",
				userId: "user_123",
				datasourceId: "11111111-1111-1111-1111-111111111111",
				tenantId: "999",
			},
			requestContext,
		);
		const datasourceId = resolveDatasourceId(
			{
				organizationId: "org_123",
				userId: "user_123",
				datasourceId: "11111111-1111-1111-1111-111111111111",
			},
			requestContext,
		);

		expect(auth.organizationId).toBe("149c3cc2-7f9e-49d0-950d-9a84aa3dd76c");
		expect(auth.tenantId).toBe("1");
		expect(auth.userId).toBe("user_123");
		expect(datasourceId).toBe("44b92908-98cb-4e5e-a429-bccd63f8090f");
	});

	test("tolerates null optional search_schema fields so requestContext can win", () => {
		const parsedInput = (searchSchemaTool as any).inputSchema.parse({
			organizationId: "149c3cc2-7f9e-49d0-950d-9a84aa3dd76c",
			tenantId: "1",
			userId: null,
			datasourceId: null,
			question: "death rate correlation by claim class",
			database: null,
			dialect: null,
		});

		expect(parsedInput.userId).toBeUndefined();
		expect(parsedInput.datasourceId).toBeUndefined();
		expect(parsedInput.database).toBeUndefined();
		expect(parsedInput.dialect).toBeUndefined();
	});

	test("rejects malformed datasourceId only after requestContext merge", () => {
		expect(() =>
			resolveDatasourceId({
				datasourceId: "44b92908-98cb-4e5-a429-bccd63f8090f",
			}),
		).toThrow(
			"datasourceId must be a valid UUID when provided in tool input or requestContext.",
		);

		expect(
			resolveDatasourceId(
				{
					datasourceId: "44b92908-98cb-4e5-a429-bccd63f8090f",
				},
				new Map([
					["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
				]),
			),
		).toBe("44b92908-98cb-4e5e-a429-bccd63f8090f");
	});

	test("defaults missing context chunk metadata to an empty object", async () => {
		const parsedInput = (generateSqlTool as any).inputSchema.parse({
			question: "show passenger count",
			contextChunks: [
				{
					source: "table_overview",
					pageContent: "Table passenger contains one row per passenger.",
				},
			],
			dialect: "bigquery",
		});

		expect(parsedInput.contextChunks[0].metadata).toEqual({});

		await (generateSqlTool as any).execute(parsedInput, {
			requestContext: new Map([
				["organizationId", "org_1"],
				["tenantId", "tenant-123"],
				["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
			]),
		});

		expect(mockGenerateObject).toHaveBeenCalled();
	});
});

describe("generateVisualizationTool", () => {
	beforeEach(() => {
		mockExecuteEmbeddedSql.mockClear();
		mockGenerateVizspecWithRetry.mockClear();
		mockGetDatasourceForOrg.mockClear();
	});

	test("re-executes SQL when rows are omitted from tool input", async () => {
		const parsedInput = (generateVisualizationTool as any).inputSchema.parse({
			question: "show passenger count",
			sql: "SELECT COUNT(*) AS passenger_count FROM passenger WHERE tenant_id = $1 LIMIT 100;",
			fields: ["passenger_count"],
		});

		const result = await (generateVisualizationTool as any).execute(parsedInput, {
			requestContext: new Map([
				["organizationId", "org_1"],
				["tenantId", "tenant-123"],
				["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
			]),
		});

		expect(mockExecuteEmbeddedSql).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org_1",
				tenantId: "tenant-123",
			}),
			expect.anything(),
			expect.objectContaining({
				sql: "SELECT COUNT(*) AS passenger_count FROM passenger WHERE tenant_id = $1 LIMIT 100;",
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				spec: expect.anything(),
			}),
		);
	});
});

describe("executeSqlTool", () => {
	beforeEach(() => {
		mockExecuteEmbeddedSql.mockClear();
		mockGetDatasourceForOrg.mockClear();
	});

	test("qualifies BigQuery tables and adds alias when table-qualified columns are used", async () => {
		await (executeSqlTool as any).execute(
			{
				sql: "SELECT github_timeline.repository_created_at FROM `analytics.github_timeline` WHERE github_timeline.tenant_id = @tenant_id LIMIT 100",
				params: [{ name: "tenant_id", value: "tenant-123" }],
			},
			{
				requestContext: new Map([
					["organizationId", "org_1"],
					["tenantId", "tenant-123"],
					["datasourceId", "44b92908-98cb-4e5e-a429-bccd63f8090f"],
				]),
			},
		);

		expect(mockExecuteEmbeddedSql).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				sql: expect.stringContaining(
					"FROM `test-project.analytics.github_timeline` AS github_timeline",
				),
			}),
		);
	});
});
