import { isJsonRenderSpecLike } from "../generative-ui/specData";

/**
 * Classic (non-Mastra) generate-chart JSON historically put VizSpec on `chartSpec`.
 * BI mode returns json-render specs; some hosts still send those on `chartSpec`.
 */
export function visualizationFromClassicGenerateChartResponse(data: {
	chartSpec?: unknown;
	jsonRenderSpec?: unknown;
}): { chartSpec?: unknown; jsonRenderSpec?: unknown } {
	if (isJsonRenderSpecLike(data.jsonRenderSpec)) {
		return { jsonRenderSpec: data.jsonRenderSpec };
	}
	if (isJsonRenderSpecLike(data.chartSpec)) {
		return { jsonRenderSpec: data.chartSpec };
	}
	if (data.chartSpec != null) {
		return { chartSpec: data.chartSpec };
	}
	return {};
}
