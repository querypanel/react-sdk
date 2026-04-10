import { RunnableLambda } from "@langchain/core/runnables";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import vegaLiteSchema from "vega-lite/vega-lite-schema.json" with {
	type: "json",
};

import type { VegaLiteSpec } from "../types/chart";

// 1) JSON-Schema validation (syntax & types)
const ajv = new Ajv({ allErrors: true, strict: false }); // VL schema isn't strict-mode clean
addFormats(ajv);

// Import the schema directly - bundler will inline it
const validateSchema = ajv.compile(vegaLiteSchema);

/**
 * Custom error for chart validation failures
 */
export class ChartValidationError extends Error {
	constructor(
		message: string,
		public details?: Record<string, any>,
	) {
		super(message);
		this.name = "ChartValidationError";
	}
}

/** Input type for validation chain - must contain chart_spec */
export interface ValidationInput {
	chart_spec: VegaLiteSpec;
	[key: string]: unknown;
}

export class ChartValidatorService {
	/**
	 * LangChain Runnable chain for chart validation
	 * Throws ChartValidationError if the chart spec is invalid, passes through otherwise
	 */
	public validationChain = RunnableLambda.from(
		<T extends ValidationInput>(input: T): T => {
			this.validate(input.chart_spec);
			// Pass through the input unchanged if validation passes
			return input;
		},
	);

	/**
	 * Validates a Vega-Lite chart specification using Ajv and the official Vega-Lite schema
	 * Throws ChartValidationError if the chart spec is invalid
	 */
	validate(chartSpec: VegaLiteSpec): void {
		const valid = validateSchema(chartSpec);

		if (!valid) {
			const errors = validateSchema.errors || [];
			const errorMessages = errors
				.map((err) => `${err.instancePath} ${err.message}`)
				.join(", ");

			throw new ChartValidationError(
				`Chart specification is invalid: ${errorMessages}`,
				{ errors },
			);
		}
	}

	/**
	 * Attempts to parse and validate chart spec from JSON string
	 * Returns parsed chart spec or throws ChartValidationError
	 */
	parseAndValidate(chartJson: string): VegaLiteSpec {
		let parsed: any;

		try {
			parsed = JSON.parse(chartJson);
		} catch (error) {
			throw new ChartValidationError("Invalid JSON in chart specification", {
				originalError: (error as Error).message,
			});
		}

		// Validate structure
		this.validate(parsed);

		return parsed as VegaLiteSpec;
	}
}
