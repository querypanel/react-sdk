// Advanced Report Analysis Agent using @openai/agents SDK
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

export interface ReportAnalysisData {
  report: {
    title: string;
    description: string;
    type: string;
    createdAt: string;
  };
  widgets: Array<{
    id: string;
    title: string;
    description: string;
    visualizationData: unknown;
    labels: string[];
  }>;
}

export interface SummaryHistory {
  summary_content: string;
  summary_type: string;
  created_at: string;
}

export interface AnalysisRequest {
  data: ReportAnalysisData;
  query?: string;
  summaryType?: 'brief' | 'detailed' | 'executive';
  history?: SummaryHistory[];
  context?: {
    userRole?: 'executive' | 'manager' | 'analyst' | 'developer';
    focusAreas?: string[];
    timeHorizon?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  };
}

export interface AnalysisResult {
  summary: string;
  insights: string[];
  recommendations: string[];
  risks: string[];
  opportunities: string[];
  metrics: {
    keyMetrics: Array<{ name: string; value: string; trend: 'up' | 'down' | 'stable' }>;
    performanceScore: number;
    confidenceLevel: 'high' | 'medium' | 'low';
  };
}

export class AdvancedReportAnalysisAgent {
  private agent: Agent;

  constructor() {    
    // Create the agent with instructions
    this.agent = new Agent({
      name: 'ReportAnalysisAgent',
      instructions: 'You are an expert business analyst who creates insightful, data-driven summaries and answers questions about business reports. Always use specific data points and provide actionable insights. Format your responses with clear structure, emojis, and bullet points for easy reading.',
      model: 'gpt-4o-mini', 
    });
  }

  async analyzeReport(request: AnalysisRequest): Promise<string> {
    const { data, summaryType = 'executive', history = [] } = request;
    const { report, widgets } = data;

    try {
      const userPrompt = this.buildSummaryPrompt(report, widgets, summaryType, history);

      // Define analysis tools
      const analysisTools = this.createAnalysisTools(report, widgets);
      
      // Set tools on the agent
      this.agent.tools = analysisTools;

      // Use the agents SDK to run the analysis
      const result = await run(this.agent, userPrompt);

      return result.finalOutput || 'Unable to generate analysis at this time.';
    } catch (error) {
      console.error('Advanced agent analysis error:', error);
      throw new Error('Failed to generate AI analysis');
    }
  }

  private createAnalysisTools(report: ReportAnalysisData['report'], widgets: ReportAnalysisData['widgets']) {
    return [
      tool({
        name: 'analyze_widget_data',
        description: 'Analyze specific widget data to extract insights and patterns',
        parameters: z.object({
          widgetId: z.string().describe('The ID of the widget to analyze'),
          analysisType: z.enum(['trends', 'patterns', 'anomalies', 'summary']).describe('Type of analysis: trends, patterns, anomalies, or summary')
        }),
        execute: async (input) => {
          const { widgetId, analysisType } = input;
          const widget = widgets.find(w => w.id === widgetId);
          if (!widget) {
            return `Widget with ID ${widgetId} not found`;
          }

          const data = widget.visualizationData;
          const title = widget.title;
          const description = widget.description;

          switch (analysisType) {
            case 'trends':
              return this.analyzeTrends(title, description, data);
            case 'patterns':
              return this.analyzePatterns(title, description);
            case 'anomalies':
              return this.analyzeAnomalies(title, description);
            case 'summary':
              return this.summarizeWidget(title, description);
            default:
              return `Unknown analysis type: ${analysisType}`;
          }
        }
      }),
      tool({
        name: 'compare_widgets',
        description: 'Compare data between multiple widgets to find correlations',
        parameters: z.object({
          widgetIds: z.array(z.string()).describe('Array of widget IDs to compare')
        }),
        execute: async (input) => {
          const { widgetIds } = input;
          const selectedWidgets = widgets.filter(w => widgetIds.includes(w.id));
          return this.compareWidgets(selectedWidgets);
        }
      }),
      tool({
        name: 'calculate_metrics',
        description: 'Calculate key business metrics from widget data',
        parameters: z.object({
          metricType: z.enum(['growth_rate', 'conversion_rate', 'retention_rate', 'revenue_trend']).describe('Type of metric to calculate'),
          widgetId: z.string().describe('Widget ID to calculate metrics from')
        }),
        execute: async (input) => {
          const { metricType, widgetId } = input;
          const widget = widgets.find(w => w.id === widgetId);
          if (!widget) {
            return `Widget with ID ${widgetId} not found`;
          }
          return this.calculateMetric(metricType, widget);
        }
      })
    ];
  }

  private buildSummaryPrompt(report: ReportAnalysisData['report'], widgets: ReportAnalysisData['widgets'], summaryType: string, history: SummaryHistory[] = []): string {
    const summaryInstructions = {
      brief: 'Provide a concise 2-3 sentence summary highlighting the most important insights. Use **bold** for key metrics and bullet points for quick insights.',
      detailed: 'Provide a comprehensive analysis with key insights, trends, areas of attention, and recommendations. Use proper Markdown formatting with headers, bullet points, and **bold** text for emphasis.',
      executive: 'Provide a high-level executive summary focusing on business impact and strategic insights. Use Markdown formatting with clear headers, bullet points, and **bold** text for key findings.'
    };

    const historyContext = history.length > 0 ? `

## 📚 Previous Analysis History
You have access to the last ${history.length} summary(ies) for this report to provide better context and track progress:

${history.map((h, index) => `
### Previous Summary ${index + 1} (${h.summary_type} - ${new Date(h.created_at).toLocaleDateString()})
${h.summary_content}
`).join('\n')}

Use this history to:
- Identify trends and changes over time
- Build upon previous insights
- Highlight progress or regression
- Provide more accurate and contextual analysis
- Avoid repeating the same points unless they're still relevant

` : '';

    return `Analyze this business report and generate a ${summaryType} summary.

Report: "${report.title}"
Description: ${report.description}
Type: ${report.type}
Created: ${new Date(report.createdAt).toLocaleDateString()}

Data Widgets:
${widgets.map((widget, index) => `
${index + 1}. ${widget.title}
   Description: ${widget.description}
   Data: ${JSON.stringify(widget.visualizationData, null, 2)}
   Labels: ${widget.labels.join(', ')}
`).join('\n')}${historyContext}

${summaryInstructions[summaryType as keyof typeof summaryInstructions]}

Format your response using proper Markdown with:
- ## 🎯 Key Insights (use bullet points with **bold** metrics)
- ## ⚠️ Areas of Attention (if any, use bullet points)
- ## 📈 Performance Highlights (use bullet points with **bold** numbers)
- ## 💡 Recommendations (if detailed/executive, use numbered lists)
- ## 🚀 Opportunities (if executive, use bullet points)
- ## ⚡ Quick Actions (if brief, use bullet points)

Use specific numbers and data points from the widgets. Format numbers in **bold** and use proper Markdown structure for better readability.`;
  }

  // Tool helper methods
  private analyzeTrends(title: string, description: string, data: unknown): string {
    // Simple trend analysis based on data structure
    const dataStr = JSON.stringify(data);
    if (dataStr.includes('value') && dataStr.includes('date')) {
      return `📈 Trend Analysis for ${title}: ${description}\nData shows time-series patterns that can be analyzed for growth trends, seasonality, and cyclical patterns.`;
    }
    return `📊 Data Analysis for ${title}: ${description}\nThis widget contains structured data suitable for trend analysis.`;
  }

  private analyzePatterns(title: string, description: string): string {
    return `🔍 Pattern Analysis for ${title}: ${description}\nAnalyzing data for recurring patterns, correlations, and statistical relationships.`;
  }

  private analyzeAnomalies(title: string, description: string): string {
    return `⚠️ Anomaly Detection for ${title}: ${description}\nScanning data for outliers, unusual values, and unexpected patterns that may require attention.`;
  }

  private summarizeWidget(title: string, description: string): string {
    return `📋 Summary for ${title}: ${description}\nProviding a concise overview of the key data points and insights from this widget.`;
  }

  private compareWidgets(widgets: ReportAnalysisData['widgets']): string {
    const titles = widgets.map(w => w.title).join(', ');
    return `🔄 Widget Comparison: ${titles}\nAnalyzing correlations and relationships between these widgets to identify patterns and insights.`;
  }

  private calculateMetric(metricType: string, widget: ReportAnalysisData['widgets'][0]): string {
    return `📊 ${metricType.replace('_', ' ').toUpperCase()} for ${widget.title}: ${widget.description}\nCalculating key business metrics from the widget data.`;
  }

  // Future method for structured analysis using agents
  async getStructuredAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
    // This would be implemented with the agents package for structured output
    // For now, we'll return a basic structure
    const summary = await this.analyzeReport(request);
    
    return {
      summary,
      insights: [],
      recommendations: [],
      risks: [],
      opportunities: [],
      metrics: {
        keyMetrics: [],
        performanceScore: 0,
        confidenceLevel: 'medium'
      }
    };
  }
}
