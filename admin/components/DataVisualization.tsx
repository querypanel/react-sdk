'use client';

import { VisualizationResponse } from '../lib/prompts';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter
} from 'recharts';
import { Button } from '@/components/ui/button';
import { SaveIcon } from 'lucide-react';

interface DataVisualizationProps {
  data: VisualizationResponse;
  onSave?: () => void;
  hideHeader?: boolean;
  compact?: boolean; // For smaller widget displays
}

// Chart colors for consistent theming
const CHART_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8dd1e1'
];

// Smart key matching function to handle AI column names vs actual data keys
const findMatchingKey = (targetKey: string, availableKeys: string[]): string => {
  if (!targetKey) return availableKeys[0] || '';
  
  // Direct match first
  if (availableKeys.includes(targetKey)) {
    return targetKey;
  }
  
  // Normalize function to handle different cases and formats
  const normalize = (str: string) => 
    str.toLowerCase()
       .replace(/[^a-z0-9]/g, '') // Remove spaces, underscores, etc.
       .trim();
  
  const normalizedTarget = normalize(targetKey);
  
  // Find best match
  const match = availableKeys.find(key => {
    const normalizedKey = normalize(key);
    return normalizedKey === normalizedTarget ||
           normalizedKey.includes(normalizedTarget) ||
           normalizedTarget.includes(normalizedKey);
  });
  
  return match || availableKeys[0] || '';
};

export default function DataVisualization({ data, onSave, hideHeader = false, compact = false }: DataVisualizationProps) {
  const { visualization, explanation } = data;

  const renderVisualization = () => {
    switch (visualization.type) {
      case 'table':
        return renderTable();
      case 'stats':
      case 'metric':
        return renderStats();
      case 'bar':
        return renderBarChart();
      case 'line':
        return renderLineChart();
      case 'pie':
        return renderPieChart();
      case 'scatter':
        return renderScatterChart();
      default:
        return renderTable(); // fallback
    }
  };

  const renderTable = () => {
    // New format: data is DataPoint[][], columns is string[]
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    // Use columns from visualization, or infer from first row
    const columns = visualization.columns || (data.data[0]?.map(dp => dp.columnName) ?? []);

    // Limit rows in compact mode
    const displayData = compact ? data.data.slice(0, 5) : data.data;

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map((column, index) => (
                <th key={index} className={`border-b border-gray-200 dark:border-gray-700 text-left font-semibold text-gray-900 dark:text-gray-100 ${
                  compact ? 'px-2 py-1 text-xs' : 'px-4 py-3'
                }`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900">
            {displayData.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {columns.map((column, colIndex) => {
                  // Find the DataPoint for this column
                  const cell = row.find(dp => dp.columnName === column);
                  return (
                    <td key={colIndex} className={`border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 ${
                      compact ? 'px-2 py-1 text-xs' : 'px-4 py-3'
                    }`}>
                      {cell ? String(cell.value) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {compact && data.data.length > 5 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-1 bg-gray-50 dark:bg-gray-800">
            Showing 5 of {data.data.length} rows
          </div>
        )}
      </div>
    );
  };

  const renderStats = () => {
    const metrics = visualization.metrics || [];
    
    if (metrics.length === 0 && data.data.length > 0) {
      // Generate basic stats from data
      const firstRow = data.data[0];
      const generatedMetrics = Object.entries(firstRow).map(([key, value]) => ({
        label: key,
        value: String(value),
        format: typeof value === 'number' ? 'number' : undefined
      }));
      
      return renderMetricCards(generatedMetrics);
    }
    
    return renderMetricCards(metrics);
  };

  const renderMetricCards = (metrics: Array<{ label: string; value: string | number; format?: string | null }>) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              {metric.label}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatValue(metric.value, metric.format ?? undefined)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderBarChart = () => {
    if (!data.data || data.data.length === 0) return renderNoData();

    // Get the keys from the first data item
    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    console.log('Available data keys:', dataKeys);
    console.log('AI wants xAxis:', visualization.xAxis, 'yAxis:', visualization.yAxis);

    // Use smart key matching with fallbacks
    const xKey = findMatchingKey(visualization.xAxis || '', dataKeys);
    const yKey = findMatchingKey(visualization.yAxis || '', dataKeys);
    
    // If no specific Y axis, use all numeric columns except X
    const yKeys = visualization.yAxis 
      ? [yKey] 
      : dataKeys.filter(key => {
          if (key === xKey) return false;
          // Find the value for this key in the first row
          const dp = data.data[0]?.find((d: { columnName: string }) => d.columnName === key);
          return typeof dp?.value === 'number';
        });

    console.log('Matched X-axis key:', xKey);
    console.log('Matched Y-axis keys:', yKeys);

    return (
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.data.map((row: { columnName: string; value: string | number }[]) => {
            const obj: Record<string, string | number> = {};
            row.forEach((dp) => { obj[dp.columnName] = dp.value; });
            return obj;
          })} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey={xKey} 
              className="text-gray-600 dark:text-gray-400" 
            />
            <YAxis className="text-gray-600 dark:text-gray-400" />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            />
            <Legend />
            {/* Render multiple bars if we have multiple Y values */}
            {yKeys.map((yAxisKey, index) => (
              <Bar 
                key={yAxisKey}
                dataKey={yAxisKey} 
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                name={yAxisKey}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderLineChart = () => {
    if (!data.data || data.data.length === 0) return renderNoData();

    // Get the keys from the first data item
    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    console.log('Available data keys:', dataKeys);
    console.log('AI wants xAxis:', visualization.xAxis, 'yAxis:', visualization.yAxis);

    // Use smart key matching with fallbacks
    const xKey = findMatchingKey(visualization.xAxis || '', dataKeys);
    const yKey = findMatchingKey(visualization.yAxis || '', dataKeys);
    
    // If no specific Y axis, use all numeric columns except X
    const yKeys = visualization.yAxis 
      ? [yKey] 
      : dataKeys.filter(key => {
          if (key === xKey) return false;
          const dp = data.data[0]?.find((d: { columnName: string }) => d.columnName === key);
          return typeof dp?.value === 'number';
        });

    console.log('Matched X-axis key:', xKey);
    console.log('Matched Y-axis keys:', yKeys);

    return (
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.data.map((row: { columnName: string; value: string | number }[]) => {
            const obj: Record<string, string | number> = {};
            row.forEach((dp) => { obj[dp.columnName] = dp.value; });
            return obj;
          })} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey={xKey} 
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis className="text-gray-600 dark:text-gray-400" />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            />
            <Legend />
            {/* Render multiple lines if we have multiple Y values */}
            {yKeys.map((yAxisKey, index) => (
              <Line 
                key={yAxisKey}
                type="monotone" 
                dataKey={yAxisKey} 
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[index % CHART_COLORS.length], strokeWidth: 2, r: 4 }}
                name={yAxisKey}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderPieChart = () => {
    if (!data.data || data.data.length === 0) return renderNoData();

    const pieData = data.data.map((row: { columnName: string; value: string | number }[], index: number) => {
      // Find the DataPoint for xAxis and yAxis
      const xCol = visualization.xAxis || (row[0]?.columnName ?? '');
      const yCol = visualization.yAxis || (row[1]?.columnName ?? '');
      const xVal = row.find(dp => dp.columnName === xCol)?.value ?? '';
      const yVal = row.find(dp => dp.columnName === yCol)?.value ?? 0;
      return {
        name: String(xVal),
        value: typeof yVal === 'number' ? yVal : parseFloat(String(yVal)) || 0,
        color: CHART_COLORS[index % CHART_COLORS.length]
      };
    });

    return (
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderScatterChart = () => {
    if (!data.data || data.data.length === 0) return renderNoData();

    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    const xKey = visualization.xAxis || dataKeys[0] || '';
    const yKey = visualization.yAxis || dataKeys[1] || '';
    const scatterData = data.data.map((row: { columnName: string; value: string | number }[]) => {
      const obj: Record<string, string | number> = {};
      row.forEach((dp) => { obj[dp.columnName] = dp.value; });
      return obj;
    });
    return (
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart data={scatterData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey={xKey}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis className="text-gray-600 dark:text-gray-400" />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            />
            <Scatter 
              dataKey={yKey}
              fill={CHART_COLORS[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderNoData = () => (
    <div className="w-full h-80 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-2">
          No Data Available
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-500">
          Unable to render {visualization.type} chart
        </div>
      </div>
    </div>
  );

  const formatValue = (value: string | number, format?: string) => {
    if (typeof value === 'number') {
      switch (format) {
        case 'percentage':
          return `${value}%`;
        case 'currency':
          return `$${value.toLocaleString()}`;
        case 'number':
          return value.toLocaleString();
        default:
          return value;
      }
    }
    return value;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {!hideHeader && (
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {visualization.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {visualization.description}
              </p>
            </div>
            {onSave && (
              <Button 
                onClick={onSave}
                className="ml-4 bg-purple-600 hover:bg-purple-700 text-white"
                size="sm"
              >
                <SaveIcon className="w-4 h-4 mr-2" />
                Save Widget
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Visualization */}
      <div>
        {renderVisualization()}
      </div>

      {/* Explanation */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          Analysis Explanation
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-300">
          {explanation}
        </p>
      </div>

      {/* Data Summary */}
      <div className="text-xs text-gray-500 dark:text-gray-500">
        Data points: {data.data.length} | Visualization type: {visualization.type}
      </div>
    </div>
  );
} 