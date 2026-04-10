import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ChartGeneratorService } from "../../src/services/chart-generator.service";
import { ChartValidationError } from "../../src/services/chart-validator.service";
import type {
	ChartGeneratorInput,
	ChartResult,
	VegaLiteSpec,
} from "../../src/types/chart";

type ChartOutputOverrides = Partial<Omit<ChartResult, "chart">> & {
	chart?: Partial<VegaLiteSpec>;
};

const buildChartOutput = (overrides?: ChartOutputOverrides): ChartResult => {
	const { chart, ...rest } = overrides ?? {};
	const baseSpec: VegaLiteSpec = {
		$schema: "https://vega.github.io/schema/vega-lite/v6.json",
		mark: "bar",
		encoding: {
			x: { field: "month", type: "ordinal" },
			y: { field: "revenue", type: "quantitative" },
		},
		data: { values: [] },
	};

	return {
		chart: { ...baseSpec, ...(chart ?? {}) } as Record<string, unknown>,
		notes: rest.notes ?? "Test notes",
	};
};

// For mocking the AI response format (before conversion to ChartResult)
const buildAIResponse = (overrides?: ChartOutputOverrides) => {
	const result = buildChartOutput(overrides);
	return {
		chart_spec: result.chart,
		notes: result.notes,
	};
};

const wrapResponse = (
	output: ReturnType<typeof buildAIResponse>,
	fenced = true,
): string => {
	const body = JSON.stringify(output);
	return fenced ? `\`\`\`json\n${body}\n\`\`\`` : body;
};

const createInput = (): ChartGeneratorInput => ({
	question: "How does revenue trend over time?",
	sql: "SELECT month, revenue FROM revenue_stats",
	rationale: "Show revenue trends",
	fields: ["month", "revenue"],
	rows: [{ month: "date", revenue: "number" }],
});

describe("ChartGeneratorService", () => {
	let service: ChartGeneratorService;

	beforeEach(() => {
		service = new ChartGeneratorService();
	});

	const setChainResponse = (response: string) => {
		(service as any).chain = { invoke: mock(async () => response) };
	};

	const setRepairChainResponse = (response: string) => {
		(service as any).repairChain = { invoke: mock(async () => response) };
	};

	const setValidator = (impl?: (spec: VegaLiteSpec) => void) => {
		const validateMock = mock((spec: VegaLiteSpec) => {
			if (impl) {
				return impl(spec);
			}
		});
		(service as any).validator = { validate: validateMock };
		return validateMock;
	};

	describe("generate", () => {
		test("strips code fences and sets empty data.values", async () => {
			const aiResponse = buildAIResponse();
			delete (aiResponse.chart_spec as any).data;
			setChainResponse(wrapResponse(aiResponse, true));

			const input = createInput();
			const result = await service.generate(input);

			expect((result.chart as any).data?.values).toEqual([]);
		});

		test("replaces values with empty array in existing data containers", async () => {
			const aiResponse = buildAIResponse({
				chart: {
					data: { name: "dataset", values: [{ test: 1 }] },
				},
			});
			setChainResponse(wrapResponse(aiResponse, false));

			const input = createInput();
			const result = await service.generate(input);

			expect((result.chart as any).data?.values).toEqual([]);
			expect((result.chart as any).data?.name).toBe("dataset");
		});

		test("throws when the model response cannot be parsed", async () => {
			setChainResponse("not-json");

			await expect(service.generate(createInput())).rejects.toThrow(
				"Failed to parse chart generation response",
			);
		});

		test("throws when the model omits chart_spec", async () => {
			const response =
				"```json\n" + JSON.stringify({ notes: "Missing spec" }) + "\n```";
			setChainResponse(response);

			await expect(service.generate(createInput())).rejects.toThrow(
				"Model response did not include chart_spec",
			);
		});
	});

	describe("repair", () => {
		test("sets empty array when repairing charts without data", async () => {
			const aiResponse = buildAIResponse();
			delete (aiResponse.chart_spec as any).data;
			setRepairChainResponse(wrapResponse(aiResponse));

			const input = createInput();
			const result = await service.repair({
				...input,
				previousChart: JSON.stringify(aiResponse.chart_spec),
				error: "Validation failed",
			} as any);

			expect((result.chart as any).data?.values).toEqual([]);
		});
	});

	describe("encoding hints", () => {
		test("formatEncodingHints returns empty string when no hints provided", () => {
			const formatted = (service as any).formatEncodingHints(undefined);
			expect(formatted).toBe("");
		});

		test("formatEncodingHints formats chart type hint", () => {
			const formatted = (service as any).formatEncodingHints({
				chartType: "bar",
			});
			expect(formatted).toContain("Chart Type: bar");
			expect(formatted).toContain("ENCODING HINTS");
		});

		test("formatEncodingHints formats x axis hint", () => {
			const formatted = (service as any).formatEncodingHints({
				xAxis: {
					field: "month",
					label: "Month",
					aggregate: "count",
					timeUnit: "month",
				},
			});
			expect(formatted).toContain('X Axis: field="month"');
			expect(formatted).toContain('label="Month"');
			expect(formatted).toContain("aggregate=count");
			expect(formatted).toContain("timeUnit=month");
		});

		test("formatEncodingHints formats y axis hint (single)", () => {
			const formatted = (service as any).formatEncodingHints({
				yAxis: {
					field: "revenue",
					aggregate: "sum",
				},
			});
			expect(formatted).toContain('Y Axis: field="revenue"');
			expect(formatted).toContain("aggregate=sum");
		});

		test("formatEncodingHints formats y axis hint (multiple)", () => {
			const formatted = (service as any).formatEncodingHints({
				yAxis: [
					{ field: "revenue", aggregate: "sum" },
					{ field: "cost", aggregate: "avg" },
				],
			});
			expect(formatted).toContain('Y Axis: field="revenue"');
			expect(formatted).toContain('Y Axis: field="cost"');
		});

		test("formatEncodingHints formats series hint", () => {
			const formatted = (service as any).formatEncodingHints({
				series: { field: "region", label: "Region" },
			});
			expect(formatted).toContain('Series/Color: field="region"');
			expect(formatted).toContain('label="Region"');
		});

		test("formatEncodingHints formats stacking hint", () => {
			const formatted = (service as any).formatEncodingHints({
				stacking: "stacked",
			});
			expect(formatted).toContain("Stacking: stacked");
		});

		test("formatEncodingHints formats limit hint", () => {
			const formatted = (service as any).formatEncodingHints({
				limit: 50,
			});
			expect(formatted).toContain("Row Limit: 50");
		});

		test("generate passes encoding hints to chain invoke", async () => {
			const aiResponse = buildAIResponse();
			const invokeArgs: any[] = [];
			(service as any).chain = {
				invoke: mock(async (args: any) => {
					invokeArgs.push(args);
					return wrapResponse(aiResponse);
				}),
			};

			const input = {
				...createInput(),
				encodingHints: {
					chartType: "line" as const,
					xAxis: { field: "month", timeUnit: "month" as const },
					yAxis: { field: "revenue", aggregate: "sum" as const },
				},
			};
			await service.generate(input);

			expect(invokeArgs[0].encoding_hints_context).toContain(
				"Chart Type: line",
			);
			expect(invokeArgs[0].encoding_hints_context).toContain(
				'X Axis: field="month"',
			);
			expect(invokeArgs[0].encoding_hints_context).toContain(
				'Y Axis: field="revenue"',
			);
		});

		test("repair passes encoding hints to repair chain", async () => {
			const aiResponse = buildAIResponse();
			const invokeArgs: any[] = [];
			(service as any).repairChain = {
				invoke: mock(async (args: any) => {
					invokeArgs.push(args);
					return wrapResponse(aiResponse);
				}),
			};

			const input = {
				...createInput(),
				previousChart: JSON.stringify(aiResponse.chart_spec),
				error: "Validation failed",
				encodingHints: {
					chartType: "bar" as const,
				},
			};
			await service.repair(input);

			expect(invokeArgs[0].encoding_hints_context).toContain("Chart Type: bar");
		});

		test("generateWithRetry passes encoding hints to generate and repair", async () => {
			const invalidOutput = buildChartOutput();
			const repaired = buildChartOutput({ notes: "Repaired chart" });
			const generateCalls: any[] = [];
			const repairCalls: any[] = [];

			// Mock generate to return invalid output
			service.generate = mock(async (input: any) => {
				generateCalls.push(input);
				return invalidOutput;
			}) as any;

			// Mock repair to return valid output
			service.repair = mock(async (input: any) => {
				repairCalls.push(input);
				return repaired;
			}) as any;

			// First validation fails, second succeeds (to trigger repair flow)
			let validationCall = 0;
			setValidator(() => {
				validationCall++;
				if (validationCall === 1) {
					const error = new ChartValidationError("Invalid encoding");
					(error as any).chartSpec = invalidOutput.chart;
					throw error;
				}
			});

			await service.generateWithRetry({
				...createInput(),
				maxRetries: 2,
				encodingHints: {
					chartType: "scatter" as const,
					limit: 100,
				},
			});

			// Check that generate was called with encoding hints
			expect(generateCalls.length).toBeGreaterThanOrEqual(1);
			expect(generateCalls[0].encodingHints.chartType).toBe("scatter");
			expect(generateCalls[0].encodingHints.limit).toBe(100);

			// Check that repair was called with encoding hints
			expect(repairCalls.length).toBeGreaterThanOrEqual(1);
			expect(repairCalls[0].encodingHints.chartType).toBe("scatter");
			expect(repairCalls[0].encodingHints.limit).toBe(100);
		});
	});

	describe("generateWithRetry", () => {
		test("performs server-side repair after validation failure", async () => {
			const invalidOutput = buildChartOutput();
			const repaired = buildChartOutput({ notes: "Repaired chart" });
			const generateMock = mock(async () => invalidOutput);
			const repairMock = mock(async () => repaired);
			service.generate = generateMock as any;
			service.repair = repairMock as any;

			let validationCall = 0;
			const validateMock = setValidator((spec) => {
				validationCall++;
				if (validationCall === 1) {
					const error = new ChartValidationError("Invalid encoding");
					(error as any).chartSpec = spec;
					throw error;
				}
			});

			const result = await service.generateWithRetry({
				...createInput(),
				maxRetries: 2,
			});

			expect(generateMock.mock.calls.length).toBe(1);
			expect(repairMock.mock.calls.length).toBe(1);
			expect(validateMock.mock.calls.length).toBe(2);
			expect(result).toEqual(repaired);
			const repairArgs = repairMock.mock.calls[0][0];
			expect(repairArgs.error).toBe("Invalid encoding");
			expect(repairArgs.previousChart).toBe(
				JSON.stringify(invalidOutput.chart),
			);
		});

		test("throws when max retries are exceeded after repeated validation failures", async () => {
			const initialOutput = buildChartOutput();
			const repairedOutput = buildChartOutput({ notes: "Attempted repair" });
			service.generate = mock(async () => initialOutput) as any;
			service.repair = mock(async () => repairedOutput) as any;

			setValidator((spec) => {
				const error = new ChartValidationError("Still invalid");
				(error as any).chartSpec = spec;
				throw error;
			});

			await expect(
				service.generateWithRetry({ ...createInput(), maxRetries: 1 }),
			).rejects.toThrow("Failed to generate valid chart after 1 attempts");
		});

		test("rethrows non-validation errors without retrying", async () => {
			const failure = new Error("LLM request failed");
			service.generate = mock(async () => {
				throw failure;
			}) as any;
			setValidator();

			await expect(service.generateWithRetry(createInput())).rejects.toBe(
				failure,
			);
		});
	});
});
