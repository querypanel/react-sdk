'use client';

import { VisualizationResponse } from '../lib/prompts';
import { Button } from './ui/button';
import { SaveIcon, LayoutIcon } from 'lucide-react';
import { useState } from 'react';
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

export type WidgetLayoutType = 
  | 'vertical'           // title > description > chart > explanation
  | 'chart-left'         // title/description on top, chart left, explanation right
  | 'chart-right'        // title/description on top, explanation left, chart right
  | 'explanation-top';   // title/description on top, explanation next, chart bottom

interface WidgetLayoutProps {
  data: VisualizationResponse;
  onSave?: () => void;
  hideHeader?: boolean;
  compact?: boolean;
  layout?: WidgetLayoutType;
  onLayoutChange?: (layout: WidgetLayoutType) => void;
  showLayoutSelector?: boolean;
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

export default function WidgetLayout({ 
  data, 
  onSave, 
  hideHeader = false, 
  compact = false, 
  layout = 'vertical',
  onLayoutChange,
  showLayoutSelector = false
}: WidgetLayoutProps) {
  const { visualization, explanation } = data;
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

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
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    const columns = visualization.columns || (data.data[0]?.map(dp => dp.columnName) ?? []);
    const displayData = compact ? data.data.slice(0, 5) : data.data;

    return (
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse ${compact ? 'text-xs' : 'text-sm'}`}>
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((column, index) => (
                <th key={index} className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-2 px-3 text-gray-900 dark:text-gray-100">
                    {formatValue(cell.value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {compact && data.data.length > 5 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Showing 5 of {data.data.length} rows
          </div>
        )}
      </div>
    );
  };

  const renderStats = () => {
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    // Use metrics if available, otherwise fall back to data
    const stats = visualization.metrics || data.data[0] || [];
    const columns = visualization.columns || (Array.isArray(stats) && stats[0] && 'columnName' in stats[0] ? stats.map(dp => dp.columnName) : []);

    return (
      <div className={`grid grid-cols-2 gap-4 ${compact ? 'gap-2' : 'gap-4'}`}>
        {stats.map((stat, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
            <div className={`font-semibold text-gray-900 dark:text-gray-100 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {formatValue(stat.value, 'format' in stat ? stat.format : undefined)}
            </div>
            <div className={`text-gray-600 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'} mt-1`}>
              {'label' in stat ? stat.label : columns[index]}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderBarChart = () => {
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    // Get the keys from the first data item
    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    
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

    const height = compact ? 200 : 300;

    return (
      <div className="w-full" style={{ height: `${height}px` }}>
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
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    // Get the keys from the first data item
    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    
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

    const height = compact ? 200 : 300;

    return (
      <div className="w-full" style={{ height: `${height}px` }}>
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
                name={yAxisKey}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderPieChart = () => {
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    const chartData = data.data.map((row, index) => ({
      name: row[0]?.value || `Item ${index + 1}`,
      value: row[1]?.value || 0
    }));

    const height = compact ? 200 : 300;

    return (
      <div className="w-full" style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={height / 3}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderScatterChart = () => {
    if (!data.data || data.data.length === 0) {
      return <div className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : ''}`}>No data available</div>;
    }

    // Get the keys from the first data item
    const dataKeys = data.data[0]?.map((dp: { columnName: string }) => dp.columnName) ?? [];
    
    // Use smart key matching with fallbacks
    const xKey = findMatchingKey(visualization.xAxis || '', dataKeys);
    const yKey = findMatchingKey(visualization.yAxis || '', dataKeys);

    const height = compact ? 200 : 300;

    return (
      <div className="w-full" style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart data={data.data.map((row: { columnName: string; value: string | number }[]) => {
            const obj: Record<string, string | number> = {};
            row.forEach((dp) => { obj[dp.columnName] = dp.value; });
            return obj;
          })} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey={xKey} 
              className="text-gray-600 dark:text-gray-400" 
            />
            <YAxis 
              dataKey={yKey} 
              className="text-gray-600 dark:text-gray-400" 
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            />
            <Scatter fill="#8884d8" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  };

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

  const renderHeader = () => (
    <div className="border-b border-gray-200 pb-4 dark:border-gray-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {visualization.title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {visualization.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {showLayoutSelector && onLayoutChange && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                className="gap-2"
              >
                <LayoutIcon className="w-4 h-4" />
                Layout
              </Button>
              {showLayoutMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                  <div className="py-1">
                    {[
                      { value: 'vertical', label: 'Vertical (Title → Chart → Explanation)' },
                      { value: 'chart-left', label: 'Chart Left, Explanation Right' },
                      { value: 'chart-right', label: 'Explanation Left, Chart Right' },
                      { value: 'explanation-top', label: 'Explanation Top, Chart Bottom' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          onLayoutChange(option.value as WidgetLayoutType);
                          setShowLayoutMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          layout === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {onSave && (
            <Button 
              onClick={onSave}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              size="sm"
            >
              <SaveIcon className="w-4 h-4 mr-2" />
              Save Widget
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const renderExplanation = () => (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
        Analysis Explanation
      </h3>
      <p className="text-sm text-blue-800 dark:text-blue-300">
        {explanation}
      </p>
    </div>
  );

  const renderChart = () => (
    <div>
      {renderVisualization()}
    </div>
  );

  const renderLayout = () => {
    switch (layout) {
      case 'vertical':
        return (
          <div className="space-y-6">
            {!hideHeader && renderHeader()}
            {renderChart()}
            {renderExplanation()}
          </div>
        );

      case 'chart-left':
        return (
          <div className="space-y-6">
            {!hideHeader && renderHeader()}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>{renderChart()}</div>
              <div>{renderExplanation()}</div>
            </div>
          </div>
        );

      case 'chart-right':
        return (
          <div className="space-y-6">
            {!hideHeader && renderHeader()}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>{renderExplanation()}</div>
              <div>{renderChart()}</div>
            </div>
          </div>
        );

      case 'explanation-top':
        return (
          <div className="space-y-6">
            {!hideHeader && renderHeader()}
            {renderExplanation()}
            {renderChart()}
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            {!hideHeader && renderHeader()}
            {renderChart()}
            {renderExplanation()}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {renderLayout()}
      
      {/* Data Summary */}
      <div className="text-xs text-gray-500 dark:text-gray-500">
        Data points: {data.data.length} | Visualization type: {visualization.type}
      </div>
    </div>
  );
}
