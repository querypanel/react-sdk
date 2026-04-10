import { test, expect, describe } from "bun:test";
import {
	ChartValidatorService,
	ChartValidationError,
} from "../../src/services/chart-validator.service";
import type { VegaLiteSpec } from "../../src/types/chart";

describe("ChartValidatorService", () => {
	const validator = new ChartValidatorService();

	describe("validate", () => {
		test("should pass validation for valid Vega-Lite v6 spec", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {
					x: { field: "category", type: "nominal" },
					y: { field: "value", type: "quantitative" },
				},
			};

			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should throw error when both $schema and required spec structure are missing", () => {
			const invalidSpec = {
				// Missing both $schema and proper spec structure
				someField: "value",
			} as any;

			expect(() => validator.validate(invalidSpec)).toThrow(
				ChartValidationError,
			);
		});

		test("should throw error for completely invalid structure", () => {
			const invalidSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				// Completely invalid structure that doesn't match any Vega-Lite pattern
				invalidProperty: 123,
			} as any;

			expect(() => validator.validate(invalidSpec)).toThrow(
				ChartValidationError,
			);
		});

		test("should throw error for invalid mark type", () => {
			const invalidSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "invalid-mark-type" as any,
				encoding: {
					x: { field: "category", type: "nominal" },
				},
			};

			expect(() => validator.validate(invalidSpec)).toThrow(
				ChartValidationError,
			);
		});

		test("should accept object-style mark specification", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: { type: "bar", color: "blue" },
				encoding: {
					x: { field: "category", type: "nominal" },
				},
			};

			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should accept spec without encoding (encoding is optional for some mark types)", () => {
			const validSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
			} as any;

			// The Vega-Lite schema allows specs without encoding in some cases
			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should accept spec with empty encoding", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {},
			};

			// Empty encoding is technically valid per the schema
			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should throw error for invalid encoding type", () => {
			const invalidSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {
					x: { field: "category", type: "invalid-type" as any },
				},
			};

			expect(() => validator.validate(invalidSpec)).toThrow(
				ChartValidationError,
			);
		});

		test("should accept valid encoding types", () => {
			const types = ["quantitative", "temporal", "ordinal", "nominal"];

			for (const type of types) {
				const validSpec: VegaLiteSpec = {
					$schema: "https://vega.github.io/schema/vega-lite/v6.json",
					data: { values: [] },
					mark: "bar",
					encoding: {
						x: { field: "test", type: type as any },
					},
				};

				expect(() => validator.validate(validSpec)).not.toThrow();
			}
		});

		test("should accept encoding with value instead of field", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {
					x: { field: "category", type: "nominal" },
					color: { value: "blue" },
				},
			};

			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should accept encoding channel with just type (field, value, datum are optional)", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {
					x: { type: "nominal" } as any,
				},
			};

			// The schema allows encoding channels with just type
			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should validate data field if present", () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				mark: "bar",
				data: {
					values: [{ a: 1 }, { a: 2 }],
				},
				encoding: {
					x: { field: "a", type: "quantitative" },
				},
			};

			expect(() => validator.validate(validSpec)).not.toThrow();
		});

		test("should throw error for completely invalid data structure", () => {
			const invalidSpec: any = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				mark: "bar",
				data: {
					// Invalid property that doesn't match any data schema pattern
					completelyInvalidProp: 12345,
				},
				encoding: {
					x: { field: "a", type: "quantitative" },
				},
			};

			expect(() => validator.validate(invalidSpec)).toThrow(
				ChartValidationError,
			);
		});

		test("should accept all valid mark types", () => {
			const validMarks = [
				"arc",
				"area",
				"bar",
				"boxplot",
				"circle",
				"errorband",
				"errorbar",
				"geoshape",
				"image",
				"line",
				"point",
				"rect",
				"rule",
				"square",
				"text",
				"tick",
				"trail",
			];

			for (const mark of validMarks) {
				const spec: VegaLiteSpec = {
					$schema: "https://vega.github.io/schema/vega-lite/v6.json",
					data: { values: [] },
					mark,
					encoding: {
						x: { field: "test", type: "quantitative" },
					},
				};

				expect(() => validator.validate(spec)).not.toThrow();
			}
		});
	});

	describe("validationChain", () => {
		test("passes through the original input when validation succeeds", async () => {
			const validSpec: VegaLiteSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "line",
				encoding: {
					x: { field: "month", type: "ordinal" },
					y: { field: "revenue", type: "quantitative" },
				},
			};

			const input = {
				chart_spec: validSpec,
				traceId: "abc-123",
			};

			const result = await validator.validationChain.invoke(input);

			expect(result).toBe(input);
		});

		test("throws ChartValidationError for invalid specs", async () => {
			const invalidSpec = {
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				encoding: {},
			} as unknown as VegaLiteSpec;

			await expect(
				validator.validationChain.invoke({ chart_spec: invalidSpec }),
			).rejects.toThrow(ChartValidationError);
		});
	});

	describe("parseAndValidate", () => {
		test("should parse and validate valid JSON", () => {
			const jsonString = JSON.stringify({
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				data: { values: [] },
				mark: "bar",
				encoding: {
					x: { field: "category", type: "nominal" },
				},
			});

			const result = validator.parseAndValidate(jsonString);

			expect(result).toBeDefined();
			expect(result.$schema).toContain("vega-lite/v6");
		});

		test("should throw error for invalid JSON", () => {
			const invalidJson = "{ not valid json }";

			expect(() => validator.parseAndValidate(invalidJson)).toThrow(
				ChartValidationError,
			);
			expect(() => validator.parseAndValidate(invalidJson)).toThrow(
				"Invalid JSON",
			);
		});

		test("should throw error for valid JSON but invalid spec", () => {
			const jsonString = JSON.stringify({
				$schema: "https://vega.github.io/schema/vega-lite/v6.json",
				mark: "bar",
				// Missing encoding
			});

			expect(() => validator.parseAndValidate(jsonString)).toThrow(
				ChartValidationError,
			);
		});
	});
});
