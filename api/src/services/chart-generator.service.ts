import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import type { CallbackHandler } from "@langfuse/langchain";
import { config } from "../config";
import { createLogger } from "../lib/logger";
import type { EncodingHints } from "../schemas/chart.schema";
import type {
	ChartGeneratorInput,
	ChartResult,
	VegaLiteSpec,
} from "../types/chart";
import {
	ChartValidationError,
	ChartValidatorService,
} from "./chart-validator.service";

const logger = createLogger("chart-generator");

interface GenerateInput {
	question: string;
	sql: string;
	rationale?: string;
	fields: string[];
	rows: Array<Record<string, unknown>>;
	callbacks?: CallbackHandler[];
	encodingHints?: EncodingHints;
}

interface RepairInput {
	question: string;
	sql: string;
	rationale?: string;
	fields: string[];
	rows: Array<Record<string, unknown>>;
	previousChart: string; // JSON string
	error: string;
	callbacks?: CallbackHandler[];
	encodingHints?: EncodingHints;
}

export class ChartGeneratorService {
	private chain: RunnableSequence<Record<string, string>, string>;
	private repairChain: RunnableSequence<Record<string, string>, string>;
	private validator: ChartValidatorService;

	constructor(
		private readonly model = new ChatOpenAI({
			openAIApiKey: config.openai.apiKey,
			modelName: config.models.chartGenerator,
			temperature: 0,
		}),
	) {
		this.validator = new ChartValidatorService();

		// Main chart generation prompt
		const prompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				[
					"You are an expert data visualization engineer creating Vega-Lite v6 chart specifications.",
					"Always return JSON with keys: chart_spec (complete Vega-Lite JSON) and notes (explanation).",
					"Analyze the data structure and choose the most appropriate visualization.",
					"Use Vega-Lite v6 schema: https://vega.github.io/schema/vega-lite/v6.json",
					"Make charts clear, accessible, and follow best practices for data visualization.",
					"IMPORTANT: Set data.values to an empty array [] - the client will populate it.",
					"When encoding hints are provided, you MUST follow them exactly.",
				].join(" "),
			],
			[
				"human",
				[
					"Original Question: {question}",
					"",
					"SQL Query Used:",
					"{sql}",
					"",
					"{rationale_context}",
					"",
					"Data Fields: {fields}",
					"",
					"Data Schema:",
					"{schema}",
					"",
					"{encoding_hints_context}",
					"",
					"Instructions:",
					"- Create a complete Vega-Lite v6 chart specification",
					"- Set $schema to 'https://vega.github.io/schema/vega-lite/v6.json'",
					"- Set data.values to [] (empty array) - client will populate with actual data",
					"- If encoding hints are provided, use the specified chart type and field mappings EXACTLY",
					"- If no encoding hints, choose appropriate mark type (bar, line, point, area, etc.) based on schema",
					"- Set proper encoding channels (x, y, color, size, etc.)",
					"- Use the inferred schema to specify field types:",
					"  * date → temporal",
					"  * number → quantitative",
					"  * string → nominal or ordinal",
					"  * boolean → nominal",
					"- Include a descriptive title based on the question",
					"- Add axis labels and formatting as needed",
					"- Make the chart responsive (use 'container' for width/height when appropriate)",
					"",
					"Common chart patterns:",
					"- Time series: line chart with temporal x-axis",
					"- Comparisons: bar chart with ordinal/nominal x-axis",
					"- Distributions: histogram or density plot",
					"- Correlations: scatter plot with two quantitative axes",
					"- Parts of whole: pie chart (arc mark) or stacked bar",
					"",
					"Respond with JSON only in this format:",
					"{{",
					'  "chart_spec": {{ complete Vega-Lite v6 specification with data.values: [] }},',
					'  "notes": "explanation of chart choice and design decisions"',
					"}}",
				].join("\n"),
			],
		]);

		this.chain = RunnableSequence.from([
			prompt,
			this.model,
			new StringOutputParser(),
		]);

		// Repair chain for fixing chart validation errors
		const repairPrompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				[
					"You are an expert at debugging and fixing Vega-Lite chart specifications.",
					"Analyze the validation error and fix the chart specification.",
					"Always return JSON with keys: chart_spec (corrected Vega-Lite JSON) and notes (explanation).",
					"Focus on fixing the specific error while maintaining the visualization intent.",
					"IMPORTANT: Set data.values to an empty array [] - the client will populate it.",
					"When encoding hints are provided, you MUST follow them exactly even when fixing errors.",
				].join(" "),
			],
			[
				"human",
				[
					"Original Question: {question}",
					"",
					"SQL Query Used:",
					"{sql}",
					"",
					"{rationale_context}",
					"",
					"Data Fields: {fields}",
					"",
					"Data Schema:",
					"{schema}",
					"",
					"{encoding_hints_context}",
					"",
					"PREVIOUS CHART SPEC (failed validation):",
					"{previous_chart}",
					"",
					"VALIDATION ERROR:",
					"{error}",
					"",
					"Instructions:",
					"- Analyze the validation error carefully",
					"- Fix the chart specification to pass validation",
					"- Ensure it uses Vega-Lite v6 schema",
					"- Keep data.values as [] (empty array)",
					"- If encoding hints are provided, maintain those specifications while fixing the error",
					"- Keep the same visualization intent if possible",
					"- Explain what was fixed in the notes",
					"",
					"Respond with JSON only in this format:",
					"{{",
					'  "chart_spec": {{ corrected Vega-Lite v6 specification with data.values: [] }},',
					'  "notes": "explanation of what was fixed"',
					"}}",
				].join("\n"),
			],
		]);

		this.repairChain = RunnableSequence.from([
			repairPrompt,
			this.model,
			new StringOutputParser(),
		]);
	}

	/**
	 * Format schema from anonymized rows
	 * Rows contain schema info like: [{ month: "date", revenue: "number" }]
	 */
	private formatSchema(rows: Array<Record<string, unknown>>): string {
		if (rows.length === 0) {
			return "No schema available";
		}

		const schemaRow = rows[0];
		return Object.entries(schemaRow!)
			.map(([field, type]) => `- ${field}: ${type}`)
			.join("\n");
	}

	/**
	 * Format encoding hints for the LLM prompt.
	 * Converts the structured hints into clear instructions.
	 */
	private formatEncodingHints(hints?: EncodingHints): string {
		if (!hints) {
			return "";
		}

		const lines: string[] = [
			"ENCODING HINTS (you MUST follow these specifications):",
		];

		if (hints.chartType) {
			lines.push(`- Chart Type: ${hints.chartType}`);
		}

		if (hints.xAxis) {
			lines.push(
				`- X Axis: field="${hints.xAxis.field}"${hints.xAxis.label ? `, label="${hints.xAxis.label}"` : ""}${hints.xAxis.aggregate ? `, aggregate=${hints.xAxis.aggregate}` : ""}${hints.xAxis.timeUnit ? `, timeUnit=${hints.xAxis.timeUnit}` : ""}`,
			);
		}

		if (hints.yAxis) {
			const yAxes = Array.isArray(hints.yAxis) ? hints.yAxis : [hints.yAxis];
			for (const y of yAxes) {
				lines.push(
					`- Y Axis: field="${y.field}"${y.label ? `, label="${y.label}"` : ""}${y.aggregate ? `, aggregate=${y.aggregate}` : ""}${y.timeUnit ? `, timeUnit=${y.timeUnit}` : ""}`,
				);
			}
		}

		if (hints.series) {
			lines.push(
				`- Series/Color: field="${hints.series.field}"${hints.series.label ? `, label="${hints.series.label}"` : ""}`,
			);
		}

		if (hints.stacking) {
			lines.push(`- Stacking: ${hints.stacking}`);
		}

		if (hints.limit) {
			lines.push(`- Row Limit: ${hints.limit}`);
		}

		return lines.length > 1 ? lines.join("\n") : "";
	}

	/**
	 * Generate chart specification from data
	 */
	async generate(input: GenerateInput): Promise<ChartResult> {
		const rationaleContext = input.rationale
			? `Rationale: ${input.rationale}`
			: "";

		const encodingHintsContext = this.formatEncodingHints(input.encodingHints);

		logger.debug(
			{
				question: input.question,
				fieldCount: input.fields.length,
				fields: input.fields,
				hasEncodingHints: !!input.encodingHints,
			},
			"Generating chart specification",
		);

		const response = await this.chain.invoke(
			{
				question: input.question,
				sql: input.sql,
				rationale_context: rationaleContext,
				fields: input.fields.join(", "),
				schema: this.formatSchema(input.rows),
				encoding_hints_context: encodingHintsContext,
			},
			{
				runName: "Chart Generation",
				callbacks: input.callbacks,
				tags: ["chart_generation"],
				metadata: {
					operation: "Chart Generation",
					hasEncodingHints: !!input.encodingHints,
				},
			},
		);

		let parsed: { chart_spec: VegaLiteSpec; notes: string };
		try {
			// Strip markdown code fences if present
			const cleanedResponse = response
				.replace(/^```json\n?/i, "")
				.replace(/\n?```$/i, "")
				.trim();
			parsed = JSON.parse(cleanedResponse);
		} catch (error) {
			logger.error(
				{ error, response },
				"Failed to parse chart generation response",
			);
			throw new Error("Failed to parse chart generation response");
		}

		if (!parsed.chart_spec) {
			throw new Error("Model response did not include chart_spec");
		}

		// Ensure data.values is set to empty array
		if (!parsed.chart_spec.data) {
			parsed.chart_spec.data = { values: [] };
		} else {
			parsed.chart_spec.data.values = [];
		}

		logger.info(
			{
				hasData: !!parsed.chart_spec.data,
				isEmpty: parsed.chart_spec.data?.values?.length === 0,
			},
			"Chart specification generated",
		);

		return {
			chart: parsed.chart_spec as Record<string, unknown>,
			notes: parsed.notes,
		};
	}

	/**
	 * Repair a failed chart specification
	 */
	async repair(input: RepairInput): Promise<ChartResult> {
		const rationaleContext = input.rationale
			? `Rationale: ${input.rationale}`
			: "";

		const encodingHintsContext = this.formatEncodingHints(input.encodingHints);

		logger.debug(
			{
				error: input.error,
				previousChartLength: input.previousChart.length,
				hasEncodingHints: !!input.encodingHints,
			},
			"Repairing chart specification",
		);

		const response = await this.repairChain.invoke(
			{
				question: input.question,
				sql: input.sql,
				rationale_context: rationaleContext,
				fields: input.fields.join(", "),
				schema: this.formatSchema(input.rows),
				previous_chart: input.previousChart,
				error: input.error,
				encoding_hints_context: encodingHintsContext,
			},
			{
				runName: "Chart Repair",
				callbacks: input.callbacks,
				tags: ["chart_repair"],
				metadata: {
					operation: "Chart Repair",
					hasEncodingHints: !!input.encodingHints,
				},
			},
		);

		let parsed: { chart_spec: VegaLiteSpec; notes: string };
		try {
			// Strip markdown code fences if present
			const cleanedResponse = response
				.replace(/^```json\n?/i, "")
				.replace(/\n?```$/i, "")
				.trim();
			parsed = JSON.parse(cleanedResponse);
		} catch (error) {
			logger.error(
				{ error, response },
				"Failed to parse chart repair response",
			);
			throw new Error("Failed to parse chart repair response");
		}

		if (!parsed.chart_spec) {
			throw new Error("Model response did not include chart_spec");
		}

		// Ensure data.values is set to empty array
		if (!parsed.chart_spec.data) {
			parsed.chart_spec.data = { values: [] };
		} else {
			parsed.chart_spec.data.values = [];
		}

		logger.info(
			{
				repaired: true,
			},
			"Chart specification repaired",
		);

		return {
			chart: parsed.chart_spec as Record<string, unknown>,
			notes: parsed.notes,
		};
	}

	/**
	 * Generate chart with automatic validation and repair loop
	 * This implements server-side retry logic
	 */
	async generateWithRetry(input: ChartGeneratorInput): Promise<ChartResult> {
		const maxRetries = input.maxRetries ?? 3;
		let lastError: string | undefined;
		let lastChart: string | undefined;
		let attempt = 0;

		logger.info(
			{
				question: input.question,
				maxRetries,
			},
			"Starting chart generation with retry loop",
		);

		while (attempt <= maxRetries) {
			try {
				let result: ChartResult;

				if (attempt > 0 && lastError && lastChart) {
					// Server-side repair for validation failures
					logger.debug({ attempt }, "Using repair chain (server-side retry)");
					result = await this.repair({
						question: input.question,
						sql: input.sql,
						rationale: input.rationale,
						fields: input.fields,
						rows: input.rows,
						previousChart: lastChart,
						error: lastError,
						callbacks: input.callbacks,
						encodingHints: input.encodingHints,
					});
				} else {
					// First attempt or no previous error
					logger.debug({ attempt }, "Using generation chain");
					result = await this.generate({
						question: input.question,
						sql: input.sql,
						rationale: input.rationale,
						fields: input.fields,
						rows: input.rows,
						callbacks: input.callbacks,
						encodingHints: input.encodingHints,
					});
				}

				// Validate the result
				this.validator.validate(result.chart as VegaLiteSpec);

				logger.info(
					{
						attempt,
					},
					"Chart generation successful",
				);

				return result;
			} catch (error) {
				if (error instanceof ChartValidationError) {
					lastError = error.message;
					lastChart = lastChart ?? JSON.stringify((error as any).chartSpec);

					logger.warn(
						{
							attempt,
							error: error.message,
							details: error.details,
						},
						"Chart validation failed, retrying",
					);

					if (attempt >= maxRetries) {
						logger.error(
							{
								attempt,
								maxRetries,
								lastError,
							},
							"Max retries exceeded for chart generation",
						);
						throw new Error(
							`Failed to generate valid chart after ${maxRetries} attempts. Last error: ${lastError}`,
						);
					}

					attempt++;
					continue;
				}

				// Non-validation error, throw immediately
				logger.error(
					{ error },
					"Chart generation failed with non-validation error",
				);
				throw error;
			}
		}

		// Should not reach here, but just in case
		throw new Error("Chart generation failed unexpectedly");
	}
}
