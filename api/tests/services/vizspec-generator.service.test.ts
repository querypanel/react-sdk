import { beforeEach, describe, expect, mock, test } from "bun:test";
import { VizSpecGeneratorService } from "../../src/services/vizspec-generator.service";
import type {
	VizSpecGeneratorInput,
	VizSpecResult,
} from "../../src/types/vizspec";

const buildVizSpecResult = (
	overrides?: Partial<VizSpecResult>,
): VizSpecResult => ({
	spec: {
		version: "1.0",
		kind: "chart",
		title: "Test Chart",
		data: { sourceId: "main_query" },
		encoding: {
			chartType: "bar",
			x: { field: "month", type: "temporal" },
			y: { field: "revenue", type: "quantitative" },
		},
	},
	notes: overrides?.notes ?? "Test notes",
	...overrides,
});

const createInput = (): VizSpecGeneratorInput => ({
	question: "How does revenue trend over time?",
	sql: "SELECT month, revenue FROM revenue_stats",
	rationale: "Show revenue trends",
	fields: ["month", "revenue"],
	rows: [{ month: "date", revenue: "number" }],
});

describe("VizSpecGeneratorService", () => {
	let service: VizSpecGeneratorService;

	beforeEach(() => {
		// Create a mock model with withStructuredOutput
		const mockStructuredModel = {
			invoke: mock(async () => buildVizSpecResult()),
		};
		const mockModel = {
			withStructuredOutput: mock(() => mockStructuredModel),
		} as any;
		service = new VizSpecGeneratorService(mockModel);
	});

	describe("formatSchema", () => {
		test("formats schema from rows", () => {
			const rows = [{ month: "date", revenue: "number" }];
			const formatted = (service as any).formatSchema(rows);
			expect(formatted).toContain("- month: date");
			expect(formatted).toContain("- revenue: number");
		});

		test("returns fallback when no rows provided", () => {
			const formatted = (service as any).formatSchema([]);
			expect(formatted).toBe("No schema available");
		});
	});

	describe("encoding hints", () => {
		test("formatSupportedChartTypesConstraint returns empty when omitted", () => {
			const block = (service as any).formatSupportedChartTypesConstraint(
				undefined,
			);
			expect(block).toBe("");
		});

		test("formatSupportedChartTypesConstraint lists allowed types", () => {
			const block = (service as any).formatSupportedChartTypesConstraint([
				"line",
				"column",
			]);
			expect(block).toContain("SUPPORTED CHART TYPES");
			expect(block).toContain("line, column");
			expect(block).toContain("encoding.chartType MUST be exactly one of");
		});

		test("formatEncodingHints returns empty string when no hints provided", () => {
			const formatted = (service as any).formatEncodingHints(undefined);
			expect(formatted).toBe("");
		});

		test("formatEncodingHints formats chart type and forces chart kind", () => {
			const formatted = (service as any).formatEncodingHints({
				chartType: "line",
			});
			expect(formatted).toContain("Chart Type: line");
			expect(formatted).toContain("kind: 'chart'");
			expect(formatted).toContain("ENCODING HINTS");
		});

		test("formatEncodingHints supports column chart type", () => {
			const formatted = (service as any).formatEncodingHints({
				chartType: "column",
			});
			expect(formatted).toContain("Chart Type: column");
			expect(formatted).toContain("kind: 'chart'");
		});

		test("formatEncodingHints formats x axis hint", () => {
			const formatted = (service as any).formatEncodingHints({
				xAxis: {
					field: "date",
					label: "Date",
					aggregate: "count",
					timeUnit: "day",
				},
			});
			expect(formatted).toContain('X Axis: field="date"');
			expect(formatted).toContain('label="Date"');
			expect(formatted).toContain("aggregate=count");
			expect(formatted).toContain("timeUnit=day");
		});

		test("formatEncodingHints formats y axis hint (single)", () => {
			const formatted = (service as any).formatEncodingHints({
				yAxis: {
					field: "amount",
					aggregate: "avg",
				},
			});
			expect(formatted).toContain('Y Axis: field="amount"');
			expect(formatted).toContain("aggregate=avg");
		});

		test("formatEncodingHints formats y axis hint (multiple)", () => {
			const formatted = (service as any).formatEncodingHints({
				yAxis: [{ field: "revenue" }, { field: "cost" }],
			});
			expect(formatted).toContain('Y Axis: field="revenue"');
			expect(formatted).toContain('Y Axis: field="cost"');
		});

		test("formatEncodingHints formats series hint", () => {
			const formatted = (service as any).formatEncodingHints({
				series: { field: "category", label: "Category" },
			});
			expect(formatted).toContain('Series/Color: field="category"');
			expect(formatted).toContain('label="Category"');
		});

		test("formatEncodingHints formats stacking hint", () => {
			const formatted = (service as any).formatEncodingHints({
				stacking: "percent",
			});
			expect(formatted).toContain("Stacking: percent");
		});

		test("formatEncodingHints formats limit hint", () => {
			const formatted = (service as any).formatEncodingHints({
				limit: 25,
			});
			expect(formatted).toContain("Row Limit: 25");
		});

		test("generate includes encoding hints in prompt", async () => {
			const result = buildVizSpecResult();
			const invokedPrompts: string[] = [];

			(service as any).structuredModel = {
				invoke: mock(async (messages: any[]) => {
					invokedPrompts.push(messages[0].content);
					return result;
				}),
			};

			const input = {
				...createInput(),
				encodingHints: {
					chartType: "area" as const,
					xAxis: { field: "month" },
					yAxis: { field: "revenue", aggregate: "sum" as const },
				},
			};
			// This test only asserts prompt formatting; keep input minimal.
			await service.generate(input as any);

			expect(invokedPrompts[0]).toContain("Chart Type: area");
			expect(invokedPrompts[0]).toContain('X Axis: field="month"');
			expect(invokedPrompts[0]).toContain('Y Axis: field="revenue"');
			expect(invokedPrompts[0]).toContain(
				"IMPORTANT: When encoding hints are provided",
			);
		});

		test("generate includes supported chart types constraint in prompt", async () => {
			const result = buildVizSpecResult();
			const invokedPrompts: string[] = [];

			(service as any).structuredModel = {
				invoke: mock(async (messages: any[]) => {
					invokedPrompts.push(messages[0].content);
					return result;
				}),
			};

			await service.generate({
				...createInput(),
				supportedChartTypes: ["line", "bar", "column", "pie"],
			});

			expect(invokedPrompts[0]).toContain("SUPPORTED CHART TYPES");
			expect(invokedPrompts[0]).toContain("line, bar, column, pie");
			expect(invokedPrompts[0]).not.toContain("area, scatter, pie");
		});

		test("repair includes encoding hints in prompt", async () => {
			const result = buildVizSpecResult();
			const invokedPrompts: string[] = [];

			(service as any).repairStructuredModel = {
				invoke: mock(async (messages: any[]) => {
					invokedPrompts.push(messages[0].content);
					return result;
				}),
			};

			const input = {
				...createInput(),
				previousSpec: JSON.stringify(result.spec),
				error: "Validation failed",
				encodingHints: {
					chartType: "scatter" as const,
				},
			};
			await service.repair(input);

			expect(invokedPrompts[0]).toContain("Chart Type: scatter");
			expect(invokedPrompts[0]).toContain(
				"IMPORTANT: When encoding hints are provided",
			);
		});

		test("generateWithRetry passes encoding hints to generate and repair", async () => {
			const repairedResult = buildVizSpecResult({ notes: "Repaired" });
			const generateCalls: any[] = [];
			const repairCalls: any[] = [];

			// Generate fails with a Zod-like error that has data, triggering repair
			service.generate = mock(async (input: any) => {
				generateCalls.push(input);
				const error = new Error("Structured output validation failed") as any;
				error.data = { invalid: "spec" }; // Simulate Zod error with data
				throw error;
			}) as any;

			// Repair succeeds
			service.repair = mock(async (input: any) => {
				repairCalls.push(input);
				return repairedResult;
			}) as any;

			const input = {
				...createInput(),
				maxRetries: 2,
				encodingHints: {
					chartType: "pie" as const,
					limit: 10,
				},
			};

			const result = await service.generateWithRetry(input);

			// Check generate was called with encoding hints
			expect(generateCalls.length).toBeGreaterThanOrEqual(1);
			expect(generateCalls[0].encodingHints.chartType).toBe("pie");
			expect(generateCalls[0].encodingHints.limit).toBe(10);

			// Check repair was called with encoding hints
			expect(repairCalls.length).toBeGreaterThanOrEqual(1);
			expect(repairCalls[0].encodingHints.chartType).toBe("pie");
			expect(repairCalls[0].encodingHints.limit).toBe(10);

			expect(result.notes).toBe("Repaired");
		});

		test("generateWithRetry passes supportedChartTypes to generate and repair", async () => {
			const repairedResult = buildVizSpecResult({ notes: "Repaired" });
			const generateCalls: any[] = [];
			const repairCalls: any[] = [];

			service.generate = mock(async (input: any) => {
				generateCalls.push(input);
				const error = new Error("Structured output validation failed") as any;
				error.data = { invalid: "spec" };
				throw error;
			}) as any;

			service.repair = mock(async (input: any) => {
				repairCalls.push(input);
				return repairedResult;
			}) as any;

			// Include "bar" since buildVizSpecResult defaults to chartType "bar".
			const supported = ["bar", "column"] as const;
			await service.generateWithRetry({
				...createInput(),
				maxRetries: 2,
				supportedChartTypes: [...supported],
			});

			expect(generateCalls[0].supportedChartTypes).toEqual(supported);
			expect(repairCalls[0].supportedChartTypes).toEqual(supported);
		});
	});

	describe("supportedChartTypes enforcement", () => {
		test("generateWithRetry repairs when model returns a disallowed chartType", async () => {
			const generateCalls: any[] = [];
			const repairCalls: any[] = [];

			service.generate = mock(async (input: any) => {
				generateCalls.push(input);
				return buildVizSpecResult({
					spec: {
						...buildVizSpecResult().spec,
						encoding: {
							...(buildVizSpecResult().spec as any).encoding,
							chartType: "area",
						},
					} as any,
				});
			}) as any;

			service.repair = mock(async (input: any) => {
				repairCalls.push(input);
				return buildVizSpecResult({
					spec: {
						...buildVizSpecResult().spec,
						encoding: {
							...(buildVizSpecResult().spec as any).encoding,
							chartType: "line",
						},
					} as any,
					notes: "Repaired",
				});
			}) as any;

			const result = await service.generateWithRetry({
				...createInput(),
				maxRetries: 2,
				supportedChartTypes: ["line", "column"],
			});

			expect(generateCalls.length).toBe(1);
			expect(repairCalls.length).toBeGreaterThanOrEqual(1);
			expect((result.spec as any).encoding.chartType).toBe("line");
		});
	});

	describe("generate", () => {
		test("returns VizSpec result from structured model", async () => {
			const expectedResult = buildVizSpecResult();
			(service as any).structuredModel = {
				invoke: mock(async () => expectedResult),
			};

			const result = await service.generate(createInput());

			expect(result.spec.kind).toBe("chart");
			expect(result.notes).toBe("Test notes");
		});

		test("passes correct metadata to invoke", async () => {
			const expectedResult = buildVizSpecResult();
			const invokeOptions: any[] = [];
			(service as any).structuredModel = {
				invoke: mock(async (_: any, options: any) => {
					invokeOptions.push(options);
					return expectedResult;
				}),
			};

			await service.generate(createInput());

			expect(invokeOptions[0].runName).toBe("VizSpec Generation");
			expect(invokeOptions[0].tags).toContain("vizspec_generation");
		});
	});

	describe("repair", () => {
		test("returns repaired VizSpec", async () => {
			const repairedResult = buildVizSpecResult({
				notes: "Fixed validation issue",
			});
			(service as any).repairStructuredModel = {
				invoke: mock(async () => repairedResult),
			};

			const result = await service.repair({
				...createInput(),
				previousSpec: "{}",
				error: "Missing required field",
			});

			expect(result.notes).toBe("Fixed validation issue");
		});
	});

	describe("generateWithRetry", () => {
		test("returns result on successful first attempt", async () => {
			const expectedResult = buildVizSpecResult();
			service.generate = mock(async () => expectedResult) as any;

			const result = await service.generateWithRetry(createInput());

			expect(result).toEqual(expectedResult);
		});

		test("retries with repair on failure when spec data available", async () => {
			const repairedResult = buildVizSpecResult({ notes: "Repaired" });

			// Generate fails with Zod-like error containing data, triggering repair flow
			service.generate = mock(async () => {
				const error = new Error("Validation failed") as any;
				error.data = { invalid: "spec" }; // Simulate Zod error with data
				throw error;
			}) as any;

			// Repair succeeds
			service.repair = mock(async () => repairedResult) as any;

			const result = await service.generateWithRetry({
				...createInput(),
				maxRetries: 2,
			});

			expect(result.notes).toBe("Repaired");
			expect((service.repair as any).mock.calls.length).toBeGreaterThanOrEqual(
				1,
			);
		});

		test("throws after max retries exceeded", async () => {
			service.generate = mock(async () => {
				throw new Error("Always fails");
			}) as any;

			service.repair = mock(async () => {
				throw new Error("Repair also fails");
			}) as any;

			await expect(
				service.generateWithRetry({ ...createInput(), maxRetries: 1 }),
			).rejects.toThrow("Failed to generate valid VizSpec after 1 attempts");
		});
	});
});
