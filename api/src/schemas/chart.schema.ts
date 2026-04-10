import { z } from "zod";

/**
 * Column metadata schema
 */
const columnMetadataSchema = z.object({
	name: z.string().min(1, "Column name is required"),
	type: z.string().min(1, "Column type is required"),
	description: z.string().optional(),
});

/**
 * Vega-Lite specification schema (simplified)
 */
const vegaLiteSpecSchema = z
	.object({
		$schema: z.string(),
		description: z.string().optional(),
		data: z
			.object({
				values: z.array(z.record(z.string(), z.any())).optional(),
				name: z.string().optional(),
			})
			.optional(),
		mark: z.union([
			z.string(),
			z
				.object({
					type: z.string(),
				})
				.passthrough(),
		]),
		encoding: z.record(
			z.string(),
			z
				.object({
					field: z.string().optional(),
					type: z
						.enum(["quantitative", "temporal", "ordinal", "nominal"])
						.optional(),
					aggregate: z.string().optional(),
					title: z.string().optional(),
				})
				.passthrough(),
		),
		title: z
			.union([
				z.string(),
				z
					.object({
						text: z.string(),
					})
					.passthrough(),
			])
			.optional(),
		width: z.union([z.number(), z.literal("container")]).optional(),
		height: z.union([z.number(), z.literal("container")]).optional(),
		config: z.record(z.string(), z.any()).optional(),
	})
	.passthrough();

/**
 * Encoding hints schema for chart modifications.
 * These hints guide the LLM to generate specific chart configurations.
 */
const encodingHintsSchema = z
	.object({
		/** Preferred chart type (bar, column, line, area, scatter, pie) */
		chartType: z
			.enum(["bar", "column", "line", "area", "scatter", "pie"])
			.optional(),
		/** X axis field configuration */
		xAxis: z
			.object({
				field: z.string(),
				label: z.string().optional(),
				type: z
					.enum(["quantitative", "temporal", "ordinal", "nominal", "boolean"])
					.optional(),
				aggregate: z
					.enum(["sum", "avg", "min", "max", "count", "distinct"])
					.optional(),
				timeUnit: z
					.enum(["year", "quarter", "month", "week", "day", "hour", "minute"])
					.optional(),
			})
			.optional(),
		/** Y axis field configuration (single or multiple) */
		yAxis: z
			.union([
				z.object({
					field: z.string(),
					label: z.string().optional(),
					type: z
						.enum(["quantitative", "temporal", "ordinal", "nominal", "boolean"])
						.optional(),
					aggregate: z
						.enum(["sum", "avg", "min", "max", "count", "distinct"])
						.optional(),
					timeUnit: z
						.enum(["year", "quarter", "month", "week", "day", "hour", "minute"])
						.optional(),
				}),
				z.array(
					z.object({
						field: z.string(),
						label: z.string().optional(),
						type: z
							.enum([
								"quantitative",
								"temporal",
								"ordinal",
								"nominal",
								"boolean",
							])
							.optional(),
						aggregate: z
							.enum(["sum", "avg", "min", "max", "count", "distinct"])
							.optional(),
						timeUnit: z
							.enum([
								"year",
								"quarter",
								"month",
								"week",
								"day",
								"hour",
								"minute",
							])
							.optional(),
					}),
				),
			])
			.optional(),
		/** Series/color field for multi-series charts */
		series: z
			.object({
				field: z.string(),
				label: z.string().optional(),
			})
			.optional(),
		/** Stacking mode for multi-series */
		stacking: z.enum(["none", "stacked", "percent"]).optional(),
		/** Maximum rows to display */
		limit: z.number().int().positive().optional(),
	})
	.optional();

export type EncodingHints = z.infer<typeof encodingHintsSchema>;

/**
 * Chart request schema
 */
export const chartRequestSchema = z.object({
	question: z.string().min(3, "Question must be at least 3 characters"),
	sql: z.string().min(1, "SQL query is required"),
	rationale: z.string().optional(),
	fields: z.array(z.string()).nonempty("At least one field is required"),
	rows: z
		.array(z.record(z.string(), z.unknown()))
		.min(1, "At least one row is required"),
	max_retries: z.number().int().min(1).max(5).optional().default(3),
	query_id: z.string().uuid().optional(),
	/** Optional encoding hints for chart modification */
	encoding_hints: encodingHintsSchema,
});

export type ChartRequest = z.infer<typeof chartRequestSchema>;

/**
 * Chart response schema
 */
export const chartResponseSchema = z.object({
	chart: z.record(z.string(), z.unknown()),
	notes: z.string().nullable(),
});

export type ChartResponse = z.infer<typeof chartResponseSchema>;
