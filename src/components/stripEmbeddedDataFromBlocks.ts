import { stripDataFromJsonRenderSpec } from "./generative-ui/specData";

export type BlockLike = {
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
  [key: string]: unknown;
};

function stripChartSpecJson(chartSpec: string): string {
  try {
    const spec = JSON.parse(chartSpec) as { data?: unknown };
    if (spec && typeof spec === "object" && spec.data) {
      const specWithoutData = { ...spec };
      delete specWithoutData.data;
      return JSON.stringify(specWithoutData);
    }
  } catch {
    // keep original on parse failure
  }
  return chartSpec;
}

function stripBlockProps(block: BlockLike): BlockLike {
  if (block.type === "chart" && typeof block.props?.chartSpec === "string") {
    const chartSpec = stripChartSpecJson(block.props.chartSpec);
    if (chartSpec === block.props.chartSpec) return block;
    return {
      ...block,
      props: {
        ...block.props,
        chartSpec,
      },
    };
  }

  if (
    block.type === "json-render-chart" &&
    typeof block.props?.jsonRenderSpec === "string"
  ) {
    try {
      const spec = JSON.parse(block.props.jsonRenderSpec);
      return {
        ...block,
        props: {
          ...block.props,
          jsonRenderSpec: JSON.stringify(stripDataFromJsonRenderSpec(spec)),
          resultId: "",
        },
      };
    } catch {
      return block;
    }
  }

  return block;
}

/** Strip embedded query rows from chart blocks, including those nested in columns. */
export function stripEmbeddedDataFromBlocks<T extends BlockLike>(blocks: T[]): T[] {
  return blocks.map((block) => {
    const stripped = stripBlockProps(block) as T;
    const children = block.children;
    if (!Array.isArray(children) || children.length === 0) return stripped;
    return {
      ...stripped,
      children: stripEmbeddedDataFromBlocks(children),
    };
  });
}
