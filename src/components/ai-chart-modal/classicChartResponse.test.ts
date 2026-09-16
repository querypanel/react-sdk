import { describe, expect, it } from "vitest";
import { visualizationFromClassicGenerateChartResponse } from "./classicChartResponse";

const jsonRenderSpec = {
	root: "c-spend",
	elements: {
		"c-spend": {
			type: "BarChart",
			props: {
				title: "Top customers by spend",
				data: [
					{ label: "Northwind", value: 84200 },
					{ label: "Globex", value: 71300 },
				],
			},
			children: [],
		},
	},
};

const vizSpec = {
	kind: "chart",
	title: "Revenue",
	encoding: { chartType: "bar" },
	data: [{ month: "Jan", revenue: 100 }],
};

describe("visualizationFromClassicGenerateChartResponse", () => {
	it("uses jsonRenderSpec when the host already sends BI-mode specs", () => {
		expect(
			visualizationFromClassicGenerateChartResponse({
				jsonRenderSpec,
				chartSpec: vizSpec,
			}),
		).toEqual({ jsonRenderSpec });
	});

	it("treats a json-render chartSpec as jsonRenderSpec so the assistant preview can render", () => {
		expect(
			visualizationFromClassicGenerateChartResponse({
				chartSpec: jsonRenderSpec,
			}),
		).toEqual({ jsonRenderSpec });
	});

	it("keeps VizSpec on chartSpec for the classic preview path", () => {
		expect(
			visualizationFromClassicGenerateChartResponse({
				chartSpec: vizSpec,
			}),
		).toEqual({ chartSpec: vizSpec });
	});
});
