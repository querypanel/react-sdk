import { z } from 'zod';

export interface VisualizationRequest {
  query: string;
  context?: string;
  preferredFormat?: 'chart' | 'table' | 'stats' | 'any';
}

export interface DataPoint {
  columnName: string;
  value: string | number;
}

export interface VisualizationResponse {
  data: DataPoint[][];
  visualization: {
    type: 'bar' | 'line' | 'pie' | 'scatter' | 'table' | 'stats' | 'metric';
    title: string;
    description: string;
    xAxis: string | null;
    yAxis: string | null;
    columns: string[] | null;
    metrics: { label: string; value: string | number; format: string | null }[] | null;
  };
  explanation: string;
}

// Zod schema for VisualizationResponse (compatible with OpenAI structured outputs)

export const VisualizationResponseSchema = z.object({
  data: z.array(
    z.array(z.object({
      columnName: z.string(),
      value: z.union([z.string(), z.number()]),
    }))
  ),
  visualization: z.object({
    type: z.enum(['bar', 'line', 'pie', 'scatter', 'table', 'stats', 'metric']),
    title: z.string(),
    description: z.string(),
    xAxis: z.string().nullable(),
    yAxis: z.string().nullable(),
    columns: z.array(z.string()).nullable(),
    metrics: z
      .array(
        z.object({
          label: z.string(),
          value: z.union([z.string(), z.number()]),
          format: z.string().nullable(),
        })
      )
      .nullable(),
  }),
  explanation: z.string(),
});
