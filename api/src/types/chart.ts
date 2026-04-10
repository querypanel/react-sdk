/**
 * Chart generation types and interfaces
 */

import type { CallbackHandler } from "@langfuse/langchain";
import type { EncodingHints } from "../schemas/chart.schema";

/**
 * Input for chart generator service
 */
export interface ChartGeneratorInput {
	question: string;
	sql: string;
	rationale?: string;
	fields: string[];
	rows: Array<Record<string, unknown>>;
	maxRetries?: number;
	queryId?: string;
	callbacks?: CallbackHandler[];
	/**
	 * Optional encoding hints for chart modification.
	 * When provided, these guide the LLM to generate specific chart configurations.
	 */
	encodingHints?: EncodingHints;
}

/**
 * Output from chart generator service (ChartResult)
 */
export interface ChartResult {
	chart: Record<string, unknown>;
	notes: string | null;
}

/**
 * Vega-Lite v6 specification type
 * This is a simplified type - full spec can be very complex
 */
export interface VegaLiteSpec {
	$schema: string;
	description?: string;
	data?: {
		values?: Array<Record<string, any>>;
		name?: string;
	};
	mark:
		| string
		| {
				type: string;
				[key: string]: any;
		  };
	encoding: {
		[channel: string]: {
			field?: string;
			type?: "quantitative" | "temporal" | "ordinal" | "nominal";
			aggregate?: string;
			title?: string;
			[key: string]: any;
		};
	};
	title?:
		| string
		| {
				text: string;
				[key: string]: any;
		  };
	width?: number | "container";
	height?: number | "container";
	config?: Record<string, any>;
	[key: string]: any;
}
