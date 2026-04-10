import { z } from "zod";

// ============================================================================
// Field Types and Formatting
// ============================================================================

const fieldTypeSchema = z.enum([
	"quantitative",
	"temporal",
	"ordinal",
	"nominal",
	"boolean",
]);

const valueFormatSchema = z.object({
	style: z
		.enum(["number", "currency", "percent", "date", "time", "datetime"])
		.nullable()
		.default(null),
	currency: z.string().nullable().default(null),
	minimumFractionDigits: z.number().int().min(0).nullable().default(null),
	maximumFractionDigits: z.number().int().min(0).nullable().default(null),
	dateStyle: z.enum(["short", "medium", "long"]).nullable().default(null),
});

const fieldRefSchema = z.object({
	field: z.string().min(1, "Field name is required"),
	label: z.string().default(""),
	type: fieldTypeSchema.nullable().default(null),
	format: valueFormatSchema.nullable().default(null),
});

const aggregateOpSchema = z.enum([
	"sum",
	"avg",
	"min",
	"max",
	"count",
	"distinct",
]);

const timeUnitSchema = z.enum([
	"year",
	"quarter",
	"month",
	"week",
	"day",
	"hour",
	"minute",
]);

const axisFieldSchema = fieldRefSchema.extend({
	aggregate: aggregateOpSchema.nullable().default(null),
	timeUnit: timeUnitSchema.nullable().default(null),
});

const metricFieldSchema = fieldRefSchema.extend({
	aggregate: aggregateOpSchema.nullable().default(null),
});

const sortSpecSchema = z.object({
	field: z.string().min(1, "Sort field is required"),
	direction: z.enum(["asc", "desc"]).nullable().default(null),
});

// ============================================================================
// Base Spec
// ============================================================================

const vizSpecBaseSchema = z.object({
	version: z.literal("1.0"),
	kind: z.enum(["chart", "table", "metric"]),
	title: z.string().nullable().default(null),
	description: z.string().nullable().default(null),
	data: z.object({
		sourceId: z.string().min(1, "Source ID is required"),
	}),
});

// ============================================================================
// Chart Spec
// ============================================================================

const chartTypeSchema = z.enum([
	"line",
	"bar", // horizontal bars (categorical on Y-axis)
	"column", // vertical bars (categorical on X-axis)
	"area",
	"scatter",
	"pie",
]);

const stackingModeSchema = z.enum(["none", "stacked", "percent"]);

const chartEncodingSchema = z.object({
	chartType: chartTypeSchema,
	x: axisFieldSchema.nullable().default(null),
	y: z
		.union([axisFieldSchema, z.array(axisFieldSchema)])
		.nullable()
		.default(null),
	series: fieldRefSchema.nullable().default(null),
	stacking: stackingModeSchema.nullable().default(null),
	sort: sortSpecSchema.nullable().default(null),
	limit: z.number().int().positive().nullable().default(null),
	tooltips: z.array(fieldRefSchema).nullable().default(null),
});

const chartSpecSchema = vizSpecBaseSchema.extend({
	kind: z.literal("chart"),
	encoding: chartEncodingSchema,
});

// ============================================================================
// Table Spec
// ============================================================================

const textAlignSchema = z.enum(["left", "right", "center"]);

const tableColumnSchema = fieldRefSchema.extend({
	width: z.number().int().positive().nullable().default(null),
	align: textAlignSchema.nullable().default(null),
	isHidden: z.boolean().nullable().default(null),
});

const tableEncodingSchema = z.object({
	columns: z.array(tableColumnSchema).min(1, "At least one column is required"),
	sort: sortSpecSchema.nullable().default(null),
	limit: z.number().int().positive().nullable().default(null),
});

const tableSpecSchema = vizSpecBaseSchema.extend({
	kind: z.literal("table"),
	encoding: tableEncodingSchema,
});

// ============================================================================
// Metric Spec
// ============================================================================

const comparisonModeSchema = z.enum(["delta", "deltaPercent", "ratio"]);

const metricTrendSchema = z.object({
	timeField: axisFieldSchema,
	valueField: metricFieldSchema,
});

const metricEncodingSchema = z.object({
	valueField: metricFieldSchema,
	comparisonField: metricFieldSchema.nullable().default(null),
	comparisonMode: comparisonModeSchema.nullable().default(null),
	trend: metricTrendSchema.nullable().default(null),
});

const metricSpecSchema = vizSpecBaseSchema.extend({
	kind: z.literal("metric"),
	encoding: metricEncodingSchema,
});

// ============================================================================
// Union Type
// ============================================================================

export const vizSpecSchema = z.discriminatedUnion("kind", [
	chartSpecSchema,
	tableSpecSchema,
	metricSpecSchema,
]);

export type VizSpecSchema = z.infer<typeof vizSpecSchema>;

// ============================================================================
// Request/Response Schemas
// ============================================================================

/**
 * Encoding hints schema for vizspec modifications.
 * These hints guide the LLM to generate specific visualization configurations.
 */
const encodingHintsSchema = z
	.object({
		/** Preferred vizspec kind (chart, table, metric) */
		kind: z.enum(["chart", "table", "metric"]).optional(),
		/** Preferred chart type (bar, line, area, scatter, pie) */
		chartType: chartTypeSchema.optional(),
		/** X axis field configuration */
		xAxis: axisFieldSchema.optional(),
		/** Y axis field configuration (single or multiple) */
		yAxis: z.union([axisFieldSchema, z.array(axisFieldSchema)]).optional(),
		/** Series/color field for multi-series charts */
		series: fieldRefSchema.optional(),
		/** Stacking mode for multi-series */
		stacking: stackingModeSchema.optional(),
		/** Maximum rows to display */
		limit: z.number().int().positive().optional(),
	})
	.optional();

export type EncodingHints = z.infer<typeof encodingHintsSchema>;

/**
 * VizSpec request schema
 */
export const vizspecRequestSchema = z.object({
	question: z.string().min(3, "Question must be at least 3 characters"),
	sql: z.string().min(1, "SQL query is required"),
	rationale: z.string().optional(),
	fields: z.array(z.string()).nonempty("At least one field is required"),
	rows: z
		.array(z.record(z.string(), z.unknown()))
		.min(1, "At least one row is required"),
	max_retries: z.number().int().min(1).max(5).optional().default(3),
	query_id: z.string().uuid().optional(),
	/** Optional encoding hints for visualization modification */
	encoding_hints: encodingHintsSchema,
	/**
	 * When set, the generator must only use these VizSpec chart types (kind "chart").
	 * Omit to allow all standard types. Table and metric kinds are unaffected.
	 */
	supported_chart_types: z
		.array(chartTypeSchema)
		.min(1, "supported_chart_types must include at least one type when provided")
		.optional(),
});

export type VizSpecRequest = z.infer<typeof vizspecRequestSchema>;

/**
 * VizSpec response schema
 */
export const vizspecResponseSchema = z.object({
	spec: vizSpecSchema,
	notes: z.string().nullable(),
});

export type VizSpecResponse = z.infer<typeof vizspecResponseSchema>;
