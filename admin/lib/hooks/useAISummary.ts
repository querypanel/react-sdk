import { useState, useCallback } from 'react';

export type SummaryType = 'brief' | 'detailed' | 'executive';

export interface AnalysisContext {
  userRole?: 'executive' | 'manager' | 'analyst' | 'developer';
  focusAreas?: string[];
  timeHorizon?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

export interface SummaryHistoryItem {
  id: string;
  summary_type: string;
  summary_content: string;
  created_at: string;
}

export interface AISummaryHook {
  summary: string | null;
  loading: boolean;
  error: string | null;
  history: SummaryHistoryItem[];
  generateSummary: (reportId: string, summaryType?: SummaryType, context?: AnalysisContext) => Promise<void>;
  askQuestion: (reportId: string, question: string, context?: AnalysisContext) => Promise<void>;
  clearSummary: () => void;
  fetchHistory: (reportId: string) => Promise<SummaryHistoryItem[]>;
  deleteSummary: (reportId: string, summaryId: string) => Promise<void>;
  loadSummaryFromHistory: (summaryContent: string) => void;
}

export function useAISummary(): AISummaryHook {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SummaryHistoryItem[]>([]);

  const generateSummary = useCallback(async (reportId: string, summaryType: SummaryType = 'brief', context?: AnalysisContext) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/reports/${reportId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summaryType, context }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err) {
      console.error('Error generating AI summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }, []);

  const askQuestion = useCallback(async (reportId: string, question: string, context?: AnalysisContext) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/reports/${reportId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: question, context }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process question');
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err) {
      console.error('Error processing question:', err);
      setError(err instanceof Error ? err.message : 'Failed to process question');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSummary = useCallback(() => {
    setSummary(null);
    setError(null);
  }, []);

  const fetchHistory = useCallback(async (reportId: string): Promise<SummaryHistoryItem[]> => {
    try {
      const response = await fetch(`/api/reports/${reportId}/summary/history`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch history');
      }

      const data = await response.json();
      const historyData = data.history || [];
      setHistory(historyData);
      return historyData;
    } catch (err) {
      console.error('Error fetching summary history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      return [];
    }
  }, []);

  const deleteSummary = useCallback(async (reportId: string, summaryId: string) => {
    try {
      const response = await fetch(`/api/reports/${reportId}/summary/history?summaryId=${summaryId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete summary');
      }

      // Remove from local state
      setHistory(prev => prev.filter(item => item.id !== summaryId));
    } catch (err) {
      console.error('Error deleting summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete summary');
    }
  }, []);

  const loadSummaryFromHistory = useCallback((summaryContent: string) => {
    setSummary(summaryContent);
    setError(null);
  }, []);

  return {
    summary,
    loading,
    error,
    history,
    generateSummary,
    askQuestion,
    clearSummary,
    fetchHistory,
    deleteSummary,
    loadSummaryFromHistory,
  };
}
