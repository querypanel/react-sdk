import { ChatOpenAI } from "@langchain/openai";
import type { CallbackHandler } from "@langfuse/langchain";
import { z } from "zod";
import { config } from "../config";
import { createLogger } from "../lib/logger";
import { type EncodingHints, vizSpecSchema } from "../schemas/vizspec.schema";
import type {
	ChartType,
	VizSpecGeneratorInput,
	VizSpecResult,
} from "../types/vizspec";

const logger = createLogger("vizspec-generator");

// Response schema for structured output
const vizspecResponseSchema = z.object({
	spec: vizSpecSchema,
	notes: z.string(),
});

interface GenerateInput {
	question: string;
	sql: string;
	rationale?: string;
	fields: string[];
	rows: Array<Record<string, unknown>>;
	callbacks?: CallbackHandler[];
	encodingHints?: EncodingHints;
	/** When set, kind "chart" must use only these chartType values */
	supportedChartTypes?: ChartType[];
}

interface RepairInput extends GenerateInput {
	previousSpec: string; // JSON string
	error: string;
}

export class VizSpecValidationError extends Error {
	constructor(
		message: string,
		public details: any,
		public vizSpec?: unknown,
	) {
		super(message);
		this.name = "VizSpecValidationError";
	}
}

export class VizSpecGeneratorService {
	private structuredModel;
	private repairStructuredModel;

	constructor(
		private readonly model = new ChatOpenAI({
			openAIApiKey: config.openai.apiKey,
			modelName: config.models.chartGenerator, // Reuse chart generator model
			temperature: 0,
		}),
	) {
		// Create structured output model for VizSpec generation
		this.structuredModel = this.model.withStructuredOutput(
			vizspecResponseSchema,
			{
				name: "generate_vizspec",
			},
		);

		// Create structured output model for repair
		this.repairStructuredModel = this.model.withStructuredOutput(
			vizspecResponseSchema,
			{
				name: "repair_vizspec",
			},
		);
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
			"",
			"ENCODING HINTS (you MUST follow these specifications exactly):",
		];

		if (hints.kind) {
			lines.push(`- Kind: ${hints.kind}`);
		}

		if (hints.chartType) {
			lines.push(`- Chart Type: ${hints.chartType}`);
			if (!hints.kind) {
				lines.push("- kind: 'chart'"); // Force chart kind when chart type is specified
			}
		}

		if (hints.xAxis) {
			const x = hints.xAxis;
			lines.push(
				`- X Axis: field="${x.field}"${x.label ? `, label="${x.label}"` : ""}${x.aggregate ? `, aggregate=${x.aggregate}` : ""}${x.timeUnit ? `, timeUnit=${x.timeUnit}` : ""}`,
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

		return lines.length > 2 ? lines.join("\n") : "";
	}

	/**
	 * Prompt block restricting which VizSpec chart types the model may emit.
	 */
	private formatSupportedChartTypesConstraint(types?: ChartType[]): string {
		if (!types?.length) {
			return "";
		}
		const list = types.join(", ");
		return `

CRITICAL — SUPPORTED CHART TYPES (downstream renderer limitation):
- When kind is "chart", encoding.chartType MUST be exactly one of: ${list}
- Do not use any other chart type name
- If you would normally choose a type that is not in this list, pick the closest allowed alternative (e.g. filled time series → prefer "line" if "area" is disallowed; point comparisons → "line" or "column" if "scatter" is disallowed)
- kind "table" and kind "metric" are always allowed regardless of this list`;
	}

	private assertSupportedChartTypes(
		spec: VizSpecResult["spec"],
		supportedChartTypes?: ChartType[],
	): void {
		if (!supportedChartTypes?.length) return;
		if (spec.kind !== "chart") return;

		const actual = spec.encoding.chartType;
		if (!supportedChartTypes.includes(actual)) {
			throw new VizSpecValidationError(
				`Unsupported chartType "${actual}" (allowed: ${supportedChartTypes.join(", ")})`,
				{
					code: "UNSUPPORTED_CHART_TYPE",
					chartType: actual,
					allowed: supportedChartTypes,
				},
				spec,
			);
		}
	}

	/**
	 * Generate VizSpec from data
	 */
	async generate(input: GenerateInput): Promise<VizSpecResult> {
		const rationaleContext = input.rationale
			? `Rationale: ${input.rationale}`
			: "";

		const encodingHintsContext = this.formatEncodingHints(input.encodingHints);
		const chartTypeConstraint = this.formatSupportedChartTypesConstraint(
			input.supportedChartTypes,
		);
		const chartTypeListForIntro = input.supportedChartTypes?.length
			? input.supportedChartTypes.join(", ")
			: "line, bar, column, area, scatter, pie";

		logger.debug(
			{
				question: input.question,
				fieldCount: input.fields.length,
				fields: input.fields,
				hasEncodingHints: !!input.encodingHints,
				supportedChartTypes: input.supportedChartTypes,
			},
			"Generating VizSpec",
		);

		const prompt = `You are an expert data visualization engineer creating flexible visualization specifications.

Analyze the data and question to choose the most appropriate visualization type:
- 'chart' for trends, comparisons, distributions (${chartTypeListForIntro})
- 'table' for detailed records, lists, or when structure matters more than visualization
- 'metric' for single KPIs, totals, or summary statistics
${chartTypeConstraint}

${encodingHintsContext ? "IMPORTANT: When encoding hints are provided below, you MUST follow them exactly." : ""}

Original Question: ${input.question}

SQL Query Used:
${input.sql}

${rationaleContext}

Data Fields: ${input.fields.join(", ")}

Data Schema:
${this.formatSchema(input.rows)}
${encodingHintsContext}

Create a complete VizSpec with:
- version: '1.0'
- kind: 'chart' | 'table' | 'metric'${encodingHintsContext ? " (follow encoding hints if provided)" : ""}
- title: descriptive title based on the question
- data: { sourceId: 'main_query' }
- encoding: appropriate fields for the chosen kind${encodingHintsContext ? " (follow encoding hints if provided)" : ""}

Field types: quantitative (numbers), temporal (dates), ordinal (ordered), nominal (categories), boolean
For charts: specify chartType, x, y, and optional series, tooltips, sort, limit
For tables: specify columns with field, label, type, format, align
For metrics: specify valueField with optional comparisonField and trend

Guidelines:
- Time series → line or area chart with temporal x-axis (only use types allowed above)
- Categorical comparisons (vertical bars) → column chart when allowed (categorical on x-axis, quantitative on y-axis)
- Categorical comparisons (horizontal bars) → bar chart when allowed (categorical on y-axis, quantitative on x-axis)
- Proportions → pie chart when allowed
- Detailed records → table
- Single aggregates → metric
- Use appropriate aggregations (sum, avg, count, etc.)
- Add helpful formatting (currency, percent, date styles)

IMPORTANT: Chart type selection:
- 'column': Vertical bars - use when categorical field is on x-axis (most common for comparisons)
- 'bar': Horizontal bars - use when categorical field is on y-axis (good for long category names or ranking)
- Default to 'column' for categorical comparisons unless horizontal orientation is explicitly requested or better suits the data
- Respect SUPPORTED CHART TYPES above when choosing chartType`;

		const response = await this.structuredModel.invoke(
			[{ role: "user", content: prompt }],
			{
				runName: "VizSpec Generation",
				callbacks: input.callbacks,
				tags: ["vizspec_generation"],
				metadata: {
					operation: "VizSpec Generation",
					hasEncodingHints: !!input.encodingHints,
					hasSupportedChartTypes: !!input.supportedChartTypes?.length,
				},
			},
		);

		logger.info(
			{
				kind: response.spec.kind,
				hasEncodingHints: !!input.encodingHints,
			},
			"VizSpec generated successfully",
		);

		return {
			spec: response.spec as VizSpecResult["spec"],
			notes: response.notes,
		};
	}

	/**
	 * Repair a failed VizSpec
	 */
	async repair(input: RepairInput): Promise<VizSpecResult> {
		const rationaleContext = input.rationale
			? `Rationale: ${input.rationale}`
			: "";

		const encodingHintsContext = this.formatEncodingHints(input.encodingHints);
		const chartTypeConstraint = this.formatSupportedChartTypesConstraint(
			input.supportedChartTypes,
		);

		logger.debug(
			{
				error: input.error,
				previousSpecLength: input.previousSpec.length,
				hasEncodingHints: !!input.encodingHints,
				supportedChartTypes: input.supportedChartTypes,
			},
			"Repairing VizSpec",
		);

		const prompt = `You are an expert at debugging and fixing visualization specifications.

Analyze the validation error and fix the VizSpec object while maintaining the visualization intent.
${chartTypeConstraint}
${encodingHintsContext ? "IMPORTANT: When encoding hints are provided below, you MUST follow them exactly even when fixing errors." : ""}

Original Question: ${input.question}

SQL Query Used:
${input.sql}

${rationaleContext}

Data Fields: ${input.fields.join(", ")}

Data Schema:
${this.formatSchema(input.rows)}
${encodingHintsContext}

PREVIOUS SPEC (failed validation):
${input.previousSpec}

VALIDATION ERROR:
${input.error}

Fix the VizSpec to pass validation:
- Ensure version is '1.0'
- Ensure data.sourceId is set to 'main_query'
- Fix the specific validation error
${encodingHintsContext ? "- Maintain the encoding hints specifications while fixing the error" : ""}
- If kind is "chart", encoding.chartType must comply with SUPPORTED CHART TYPES above
- Keep the same visualization intent if possible`;

		const response = await this.repairStructuredModel.invoke(
			[{ role: "user", content: prompt }],
			{
				runName: "VizSpec Repair",
				callbacks: input.callbacks,
				tags: ["vizspec_repair"],
				metadata: {
					operation: "VizSpec Repair",
					hasEncodingHints: !!input.encodingHints,
				},
			},
		);

		logger.info(
			{
				repaired: true,
				kind: response.spec.kind,
				hasEncodingHints: !!input.encodingHints,
			},
			"VizSpec repaired successfully",
		);

		return {
			spec: response.spec as VizSpecResult["spec"],
			notes: response.notes,
		};
	}

	/**
	 * Generate VizSpec with automatic validation and repair loop
	 */
	async generateWithRetry(
		input: VizSpecGeneratorInput,
	): Promise<VizSpecResult> {
		const maxRetries = input.maxRetries ?? 3;
		let lastError: string | undefined;
		let lastSpec: string | undefined;
		let lastErrorObj: unknown | undefined;
		let attempt = 0;

		logger.info(
			{
				question: input.question,
				maxRetries,
			},
			"Starting VizSpec generation with retry loop",
		);

		while (attempt <= maxRetries) {
			try {
				let result: VizSpecResult;

				if (attempt > 0 && lastError && lastSpec) {
					// Server-side repair for validation failures
					logger.debug({ attempt }, "Using repair chain (server-side retry)");
					result = await this.repair({
						question: input.question,
						sql: input.sql,
						rationale: input.rationale,
						fields: input.fields,
						rows: input.rows,
						previousSpec: lastSpec,
						error: lastError,
						callbacks: input.callbacks,
						encodingHints: input.encodingHints,
						supportedChartTypes: input.supportedChartTypes,
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
						supportedChartTypes: input.supportedChartTypes,
					});
				}

				logger.info(
					{
						attempt,
						kind: result.spec.kind,
					},
					"VizSpec generation successful",
				);

				// Enforce supported chart types as a hard constraint so we can repair/regenerate.
				this.assertSupportedChartTypes(
					result.spec,
					input.supportedChartTypes,
				);

				return result;
			} catch (error) {
				// Handle any generation errors with retry logic
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				lastError = errorMessage;
				lastErrorObj = error;

				// Try to extract spec from error if available (for Zod errors)
				if (error && typeof error === "object" && "data" in error) {
					try {
						lastSpec = JSON.stringify((error as any).data);
					} catch {
						lastSpec = lastSpec ?? "{}";
					}
				}

				// If we have a full VizSpec from a validation error, use it as repair input.
				if (!lastSpec && error instanceof VizSpecValidationError && error.vizSpec) {
					try {
						lastSpec = JSON.stringify(error.vizSpec);
					} catch {
						lastSpec = lastSpec ?? "{}";
					}
				}

				logger.warn(
					{
						attempt,
						error: errorMessage,
					},
					"VizSpec generation failed, retrying",
				);

				if (attempt >= maxRetries) {
					logger.error(
						{
							attempt,
							maxRetries,
							lastError,
						},
						"Max retries exceeded for VizSpec generation",
					);
					if (lastErrorObj instanceof VizSpecValidationError) {
						throw lastErrorObj;
					}
					throw new Error(
						`Failed to generate valid VizSpec after ${maxRetries} attempts. Last error: ${lastError}`,
					);
				}

				attempt++;
			}
		}

		// Should not reach here, but just in case
		throw new Error("VizSpec generation failed unexpectedly");
	}
}
