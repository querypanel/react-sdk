"use client"

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// Tabs removed — consolidating UI into a single page
import {
  DatabaseIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  LoaderIcon,
  Trash2Icon,
  PencilIcon,
  DownloadIcon,
  LightbulbIcon,
  XIcon,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SchemaTraining from '@/components/SchemaTraining';
import MagicalIndicator from '@/components/ui/MagicalIndicator';
import AIAnalysisRenderer from '@/components/AIAnalysisRenderer';
import { trackEvent, trackPageView } from '@/lib/analytics/mixpanel';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';

interface SchemaChunk {
  id: string;
  schema_name: string;
  table_name: string;
  target_db: string | null;
  chunk_type: string;
  content: string;
  column_names: string[] | null;
  column_count: number | null;
  created_at: string;
  metadata?: {
    type?: string;
    table?: string;
    column?: string;
    dialect?: string;
    database?: string;
    data_type?: string;
    is_primary_key?: boolean;
    target_identifier?: string;
  };
}

const formatChunkContent = (content: string, type: string) => {
  if (type === 'gold_sql') {
    const normalized = content.replace(/\r\n/g, '\n');
    // Find "SQL:" separator, handling potential whitespace
    const match = normalized.match(/(?:^|\n)\s*SQL:\s*(?:\n|$)/i);
    
    if (match && match.index !== undefined) {
      let question = normalized.substring(0, match.index).trim();
      const sql = normalized.substring(match.index + match[0].length).trim();
      
      // Remove "Question:" prefix if present (to avoid duplication if it was part of the content)
      if (question.match(/^Question:\s*/i)) {
        question = question.replace(/^Question:\s*/i, '');
      }
      
      return `**Question:** ${question}\n\n**SQL:**\n\`\`\`sql\n${sql}\n\`\`\``;
    }
  }
  return content;
};

const parseGlossaryContent = (content: string): { term: string; definition: string } => {
  // Glossary content format: "Term: {term}\nDefinition: {definition}"
  const termMatch = content.match(/^Term:\s*(.+?)(?:\n|$)/i);
  // Use [\s\S] instead of . with /s flag to match any character including newlines
  const definitionMatch = content.match(/Definition:\s*([\s\S]+?)$/i);
  
  return {
    term: termMatch?.[1]?.trim() || '',
    definition: definitionMatch?.[1]?.trim() || '',
  };
};

const parseGoldSQLContent = (content: string): { question: string; sql: string } => {
  const normalized = content.replace(/\r\n/g, '\n');
  
  // Try to find SQL in code fence
  const codeFenceMatch = normalized.match(/```sql\n([\s\S]*?)```/);
  if (codeFenceMatch) {
    const sql = codeFenceMatch[1].trim();
    const beforeFence = normalized.substring(0, normalized.indexOf('```sql')).trim();
    const question = beforeFence.replace(/^\*\*Question:\*\*\s*/i, '').replace(/^Question:\s*/i, '').trim();
    return { question, sql };
  }
  
  // Try "SQL:" separator format
  const sqlMatch = normalized.match(/(?:^|\n)\s*SQL:\s*(?:\n|$)/i);
  if (sqlMatch && sqlMatch.index !== undefined) {
    let question = normalized.substring(0, sqlMatch.index).trim();
    const sql = normalized.substring(sqlMatch.index + sqlMatch[0].length).trim();
    question = question.replace(/^Question:\s*/i, '');
    return { question, sql };
  }
  
  return { question: '', sql: content };
};

interface Pagination {
  current_page: number;
  total_pages: number;
  page_size: number;
  total_count: number;
}

const KNOWLEDGE_BASE_TIP_DISMISSED_KEY = 'querypanel.knowledgeBase.tipDismissed';

export default function SchemaManagementPage() {
  const tableFilterId = useId();
  const chunkTypeFilterId = useId();
  const targetDbFilterId = useId();
  const editGlossaryTermId = useId();
  const editGlossaryDefinitionId = useId();
  const editGoldSqlQuestionId = useId();
  const editGoldSqlQueryId = useId();
  const editGoldSqlNameId = useId();
  const editGoldSqlDescriptionId = useId();
  const { currentOrganizationId, currentOrganization, loading: orgLoading } = useOrganizationContext();
  // removed anchor id; modal used instead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasAddedEntries, setHasAddedEntries] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<SchemaChunk | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chunkToDelete, setChunkToDelete] = useState<SchemaChunk | null>(null);
  
  const [chunks, setChunks] = useState<SchemaChunk[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    current_page: 1,
    total_pages: 0,
    page_size: 50,
    total_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const orgId = currentOrganizationId;

  // Filters
  const [tableFilter, setTableFilter] = useState('');
  const [chunkTypeFilter, setChunkTypeFilter] = useState('');
  const [targetDbFilter, setTargetDbFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Databases for dropdown
  const [databases, setDatabases] = useState<Array<{id: string; database_name: string; dialect: string}>>([]);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const [knowledgeGuideOpen, setKnowledgeGuideOpen] = useState(false);
  const [knowledgeTipDismissed, setKnowledgeTipDismissed] = useState<boolean | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<string>('chunk_type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Virtual scroll
  const parentRef = useRef<HTMLDivElement>(null);

  // Track page view
  useEffect(() => {
    trackPageView("Knowledge Base Page");
  }, []);

  useEffect(() => {
    try {
      setKnowledgeTipDismissed(localStorage.getItem(KNOWLEDGE_BASE_TIP_DISMISSED_KEY) === '1');
    } catch {
      setKnowledgeTipDismissed(false);
    }
  }, []);

  const dismissKnowledgeTip = () => {
    try {
      localStorage.setItem(KNOWLEDGE_BASE_TIP_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setKnowledgeTipDismissed(true);
  };

  // Fetch databases for dropdown
  useEffect(() => {
    const fetchDatabases = async () => {
      if (!orgId) {
        setDatabases([]);
        return;
      }
      try {
        const response = await fetch('/api/databases', {
          headers: { 'x-organization-id': orgId },
        });
        if (response.ok) {
          const data = await response.json();
          setDatabases(data.databases || []);
        }
      } catch (error) {
        console.error('Failed to fetch databases:', error);
      }
    };
    fetchDatabases();
  }, [orgId]);

  type FetchOverrides = {
    tableFilter?: string;
    chunkTypeFilter?: string;
    targetDbFilter?: string;
    searchFilter?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };

  const fetchSchemaChunks = useCallback(async (page: number, append = false, overrides?: FetchOverrides) => {
    if (!orgId) {
      setChunks([]);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const effectiveTableFilter = overrides?.tableFilter ?? tableFilter;
    const effectiveChunkTypeFilter = overrides?.chunkTypeFilter ?? chunkTypeFilter;
    const effectiveTargetDbFilter = overrides?.targetDbFilter ?? targetDbFilter;
    const effectiveSearchFilter = overrides?.searchFilter ?? searchFilter;
    const effectiveStartDate = overrides?.startDate ?? startDate;
    const effectiveEndDate = overrides?.endDate ?? endDate;
    const effectiveSortBy = overrides?.sortBy ?? sortBy;
    const effectiveSortOrder = overrides?.sortOrder ?? sortOrder;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Helper to build params for a specific chunk type
      const buildParams = (chunkType?: string) => {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '50',
          sort_by: effectiveSortBy,
          sort_order: effectiveSortOrder,
        });

        if (effectiveTableFilter) params.append('table_name', effectiveTableFilter);
        if (chunkType) params.append('chunk_type', chunkType);
        if (effectiveTargetDbFilter) params.append('target_db', effectiveTargetDbFilter);
        if (effectiveSearchFilter) params.append('search', effectiveSearchFilter);
        if (effectiveStartDate) params.append('start_date', effectiveStartDate);
        if (effectiveEndDate) params.append('end_date', effectiveEndDate);
        return params;
      };

      let allChunks: SchemaChunk[] = [];
      let combinedPagination: Pagination = {
        current_page: page,
        total_pages: 0,
        page_size: 50,
        total_count: 0,
      };

      // When no filter is selected, fetch only glossary and gold_sql
      if (!effectiveChunkTypeFilter) {
        const response = await fetch(`/api/schema-chunks?${buildParams('gold_sql,glossary').toString()}`, {
          headers: { 'x-organization-id': orgId },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch schema chunks');
        }

        const data = await response.json();
        allChunks = data.chunks || [];
        combinedPagination = data.pagination || combinedPagination;
      } else {
        // Single chunk type filter
        const response = await fetch(`/api/schema-chunks?${buildParams(effectiveChunkTypeFilter).toString()}`, {
          headers: { 'x-organization-id': orgId },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch schema chunks');
        }

        const data = await response.json();
        allChunks = data.chunks || [];
        combinedPagination = data.pagination || combinedPagination;
      }

      if (append) {
        setChunks(prev => [...prev, ...allChunks]);
      } else {
        setChunks(allChunks);
      }

      setPagination(combinedPagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schema chunks');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [chunkTypeFilter, orgId, sortBy, sortOrder, tableFilter, targetDbFilter, searchFilter, startDate, endDate]);

  const lastOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId || lastOrgIdRef.current === orgId) return;
    lastOrgIdRef.current = orgId;
    setCurrentPage(1);
    setExpandedRows(new Set());
    fetchSchemaChunks(1, false);
  }, [orgId, fetchSchemaChunks]);

  // When page changes (pagination via infinite scroll), fetch and append
  useEffect(() => {
    if (currentPage > 1) {
      fetchSchemaChunks(currentPage, true);
    }
  }, [currentPage, fetchSchemaChunks]);

  const refreshFirstPage = useCallback((overrides?: FetchOverrides) => {
    setCurrentPage(1);
    setChunks([]);
    setExpandedRows(new Set());
    fetchSchemaChunks(1, false, overrides);
  }, [fetchSchemaChunks]);

  // Auto-apply filters with debouncing for text inputs
  useEffect(() => {
    if (!orgId) return;
    const timer = setTimeout(() => {
      refreshFirstPage();
    }, 500); // 500ms debounce for text filters
    return () => clearTimeout(timer);
  }, [searchFilter, tableFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apply filters immediately for dropdowns and dates
  useEffect(() => {
    if (!orgId) return;
    refreshFirstPage();
  }, [chunkTypeFilter, targetDbFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Virtual scrolling setup with dynamic sizing
  const rowVirtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index) => {
      // Estimate expanded rows as much larger
      const chunk = chunks[index];
      return expandedRows.has(chunk?.id) ? 400 : 60;
    }, [chunks, expandedRows]),
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Detect when user scrolls near bottom
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const virtualItems = rowVirtualizer.getVirtualItems();
      const [lastItem] = [...virtualItems].reverse();

      if (!lastItem) return;

      // Trigger load more when we're close to the end (within 5 items)
      if (
        lastItem.index >= chunks.length - 5 &&
        currentPage < pagination.total_pages &&
        !loadingMore &&
        !loading
      ) {
        setCurrentPage(prev => prev + 1);
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [chunks.length, currentPage, pagination.total_pages, loadingMore, loading, rowVirtualizer]);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const confirmDelete = (chunk: SchemaChunk) => {
    setChunkToDelete(chunk);
    setShowDeleteModal(true);
  };

  const deleteChunk = async () => {
    if (!chunkToDelete) return;
    
    try {
      setDeletingId(chunkToDelete.id);
      const res = await fetch(`/api/chunks/${chunkToDelete.id}`, {
        method: 'DELETE',
        headers: orgId ? { 'x-organization-id': orgId } : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete chunk');
      }
      setChunks(prev => prev.filter(c => c.id !== chunkToDelete.id));
      setShowDeleteModal(false);
      setChunkToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chunk');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (column: string) => {
    const nextSortBy = sortBy === column ? sortBy : column;
    const nextSortOrder = sortBy === column
      ? (sortOrder === 'asc' ? 'desc' : 'asc')
      : 'desc';
    if (sortBy === column) {
      // Toggle sort order
      setSortOrder(nextSortOrder);
    } else {
      // New column, default to descending
      setSortBy(nextSortBy);
      setSortOrder(nextSortOrder);
    }
    refreshFirstPage({ sortBy: nextSortBy, sortOrder: nextSortOrder });
  };

  const handleClearFilters = () => {
    setTableFilter('');
    setChunkTypeFilter('');
    setTargetDbFilter('');
    setSearchFilter('');
    setStartDate('');
    setEndDate('');
    refreshFirstPage({
      tableFilter: '',
      chunkTypeFilter: '',
      targetDbFilter: '',
      searchFilter: '',
      startDate: '',
      endDate: '',
    });
  };

  // Export gold SQL to CSV
  const handleExportGoldSQL = async () => {
    if (!orgId) return;

    setIsExporting(true);
    try {
      // Fetch all gold_sql chunks with current filters
      const allChunks: SchemaChunk[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '100',
          chunk_type: 'gold_sql', // Always filter for gold_sql
        });

        // Apply current filters
        if (tableFilter) params.append('table_name', tableFilter);
        if (targetDbFilter) params.append('target_db', targetDbFilter);
        if (searchFilter) params.append('search', searchFilter);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const response = await fetch(`/api/schema-chunks?${params.toString()}`, {
          headers: { 'x-organization-id': orgId },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data for export');
        }

        const data = await response.json();
        allChunks.push(...(data.chunks || []));

        // Check if there are more pages
        hasMore = data.pagination?.current_page < data.pagination?.total_pages;
        page++;
      }

      if (allChunks.length === 0) {
        alert('No gold SQL entries found to export');
        return;
      }

      // Parse content to extract question and SQL
      const parseGoldSQLContent = (content: string): { question: string; sql: string } => {
        const normalized = content.replace(/\r\n/g, '\n');

        // Try to find SQL in code fence
        const codeFenceMatch = normalized.match(/```sql\n([\s\S]*?)```/);
        if (codeFenceMatch) {
          const sql = codeFenceMatch[1].trim();
          const beforeFence = normalized.substring(0, normalized.indexOf('```sql')).trim();
          // Extract question, removing "Question:" prefix if present
          const question = beforeFence.replace(/^\*\*Question:\*\*\s*/i, '').replace(/^Question:\s*/i, '').trim();
          return { question, sql };
        }

        // Try "SQL:" separator format
        const sqlMatch = normalized.match(/(?:^|\n)\s*SQL:\s*(?:\n|$)/i);
        if (sqlMatch && sqlMatch.index !== undefined) {
          let question = normalized.substring(0, sqlMatch.index).trim();
          const sql = normalized.substring(sqlMatch.index + sqlMatch[0].length).trim();
          question = question.replace(/^Question:\s*/i, '');
          return { question, sql };
        }

        // Fallback: use full content as SQL
        return { question: '', sql: content };
      };

      // Escape CSV field (handle commas, quotes, newlines)
      const escapeCSV = (field: string): string => {
        if (!field) return '';
        const needsQuotes = field.includes(',') || field.includes('"') || field.includes('\n');
        if (needsQuotes) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      // Generate CSV
      const headers = ['Question', 'SQL', 'Database', 'Table'];
      const rows = allChunks.map(chunk => {
        const { question, sql } = parseGoldSQLContent(chunk.content);
        return [
          escapeCSV(question),
          escapeCSV(sql),
          escapeCSV(chunk.schema_name || chunk.metadata?.database || ''),
          escapeCSV(chunk.table_name || chunk.metadata?.table || ''),
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `gold-sql-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      trackEvent("Gold SQL Exported", {
        organization_id: orgId,
        count: allChunks.length,
        filters: { tableFilter, targetDbFilter, searchFilter, startDate, endDate },
      });
    } catch (err) {
      console.error('Export error:', err);
      alert(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedChunk) return;

    setIsEditing(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const formData = new FormData(e.currentTarget);
      const payload: {
        term?: string;
        definition?: string;
        question?: string;
        sql?: string;
        name?: string;
        description?: string;
      } = {};

      // Build payload based on chunk type
      if (selectedChunk.chunk_type === 'glossary') {
        payload.term = formData.get('term') as string;
        payload.definition = formData.get('definition') as string;
      } else if (selectedChunk.chunk_type === 'gold_sql') {
        payload.question = formData.get('question') as string;
        payload.sql = formData.get('sql') as string;
        payload.name = formData.get('name') as string;
        payload.description = formData.get('description') as string;
      }

      const response = await fetch(`/api/chunks/${selectedChunk.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(orgId ? { 'x-organization-id': orgId } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to update entry');
      }

      trackEvent("Chunk Edited", {
        chunk_type: selectedChunk.chunk_type,
        chunk_id: selectedChunk.id,
      });
      setEditSuccess('Entry updated successfully!');
      
      // Refresh the list after a short delay
      setTimeout(() => {
        setShowEditModal(false);
        setSelectedChunk(null);
        refreshFirstPage();
      }, 1500);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update entry');
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <BrainIcon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Knowledge base
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Curated gold SQL and glossary entries that steer AI-generated queries toward vetted patterns and
              your team&apos;s vocabulary.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 border-dashed"
          onClick={() => setKnowledgeGuideOpen(true)}
        >
          <LightbulbIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          About knowledge base
        </Button>
      </div>

      {orgId && !orgLoading && knowledgeTipDismissed === false && (
        <div
          className="relative flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] py-2.5 pl-3 pr-11 text-sm dark:bg-amber-500/10"
          role="status"
        >
          <LightbulbIcon
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 pt-0.5 text-muted-foreground">
            <p>
              <span className="text-foreground">Tip:</span> gold SQL and glossary rows are embedded with your
              schema so the model favors proven questions and definitions.{' '}
              <button
                type="button"
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                onClick={() => setKnowledgeGuideOpen(true)}
              >
                Open guide
              </button>
            </p>
          </div>
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
            aria-label="Dismiss tip"
            onClick={dismissKnowledgeTip}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {orgLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !orgId ? (
        <Card className="relative overflow-hidden border-purple-200 dark:border-purple-800">
          <CardContent className="pt-12 text-center space-y-4">
            <div className="text-6xl mb-2">🚀</div>
            <h2 className="text-xl font-semibold">Let&apos;s create a workspace</h2>
            <p className="text-muted-foreground">Get started by setting up your workspace, then you can start training your model</p>
            <a href="/dashboard/home">
              <Button className="mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">Go to home</Button>
            </a>
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Knowledge base */}
      <div className="space-y-6">
        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleExportGoldSQL}
            disabled={isExporting}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <>
                <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <DownloadIcon className="w-4 h-4 mr-2" />
                Export Gold SQL
              </>
            )}
          </Button>
          <Button onClick={() => {
            trackEvent("Training Modal Opened", { location: "knowledge_base_page" });
            setShowCreateModal(true);
          }} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 sm:w-auto">
            Train model
          </Button>
        </div>

        {/* Filters - Always visible */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Type Dropdown */}
              <div className="space-y-2">
                <Label htmlFor={chunkTypeFilterId} className="text-sm font-medium">Type</Label>
                <select
                  id={chunkTypeFilterId}
                  value={chunkTypeFilter}
                  onChange={(e) => setChunkTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                >
                  <option value="">All types</option>
                  <option value="gold_sql">Gold SQL</option>
                  <option value="glossary">Glossary</option>
                </select>
              </div>

              {/* Database Dropdown */}
              <div className="space-y-2">
                <Label htmlFor={targetDbFilterId} className="text-sm font-medium">Database</Label>
                <select
                  id={targetDbFilterId}
                  value={targetDbFilter}
                  onChange={(e) => setTargetDbFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                >
                  <option value="">All databases</option>
                  {databases.map(db => (
                    <option key={db.id} value={db.database_name}>
                      {db.database_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Table Name */}
              <div className="space-y-2">
                <Label htmlFor={tableFilterId} className="text-sm font-medium">Table</Label>
                <Input
                  id={tableFilterId}
                  placeholder="Filter by table..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                />
              </div>

              {/* Content Search */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Search</Label>
                <Input
                  placeholder="Search content..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="w-full sm:w-auto"
              >
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

          {/* Schema Chunks Table */}
          <Card>
            <CardContent className="pt-6">
              {loading && chunks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-500">
                  <p>{error}</p>
                </div>
              ) : chunks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DatabaseIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No knowledge base entries found</p>
                  <p className="text-sm">Try adjusting your filters or create a training session</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Table Header with Sortable Columns */}
                  <div className="hidden grid-cols-12 gap-4 rounded-lg bg-muted px-4 py-3 text-sm font-medium md:grid">
                    <div className="col-span-1"></div>
                    <button
                      type="button"
                      onClick={() => handleSort('table_name')}
                      className="col-span-2 flex items-center gap-1 hover:text-purple-600 transition-colors text-left"
                    >
                      Table
                      {sortBy === 'table_name' && (
                        sortOrder === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />
                      )}
                    </button>
                    <div className="col-span-3 text-left">
                      Content
                    </div>
                    <div className="col-span-2 text-left">
                      Database
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSort('chunk_type')}
                      className="col-span-1 flex items-center gap-1 hover:text-purple-600 transition-colors text-left"
                    >
                      Type
                      {sortBy === 'chunk_type' && (
                        sortOrder === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSort('created_at')}
                      className="col-span-1 flex items-center gap-1 hover:text-purple-600 transition-colors text-left"
                    >
                      Created
                      {sortBy === 'created_at' && (
                        sortOrder === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />
                      )}
                    </button>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {/* Virtual Scrolling Container */}
                  <div
                    ref={parentRef}
                    className="overflow-auto rounded-lg md:rounded-none"
                    style={{ height: 'min(600px, 65vh)' }}
                  >
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const chunk = chunks[virtualRow.index];
                        const isExpanded = expandedRows.has(chunk.id);
                        
                        return (
                          <div
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <div className="mb-2 rounded-lg border">
                              <div className="hidden grid-cols-12 items-center gap-4 px-4 py-3 md:grid">
                                <button
                                  type="button"
                                  onClick={() => toggleRow(chunk.id)}
                                  className="col-span-10 grid grid-cols-10 gap-4 items-center text-left hover:bg-muted/50 transition-colors rounded-md px-2 py-2"
                                >
                                <div className="col-span-1">
                                  {isExpanded ? (
                                    <ChevronDownIcon className="w-4 h-4" />
                                  ) : (
                                    <ChevronRightIcon className="w-4 h-4" />
                                  )}
                                </div>
                                  <div className="col-span-2 font-medium truncate">{chunk.table_name || 'N/A'}</div>
                                  <div className="col-span-3 truncate text-sm text-muted-foreground">
                                    {(() => {
                                      if (chunk.chunk_type === 'glossary') {
                                        const { term, definition } = parseGlossaryContent(chunk.content);
                                        return `${term}: ${definition}`;
                                      } else if (chunk.chunk_type === 'gold_sql') {
                                        const { question } = parseGoldSQLContent(chunk.content);
                                        return question || 'SQL query';
                                      }
                                      return '-';
                                    })()}
                                  </div>
                                  <div className="col-span-2 truncate text-sm">
                                    {chunk.metadata?.dialect || chunk.schema_name || '-'}
                                  </div>
                                  <div className="col-span-1">
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-md text-xs">
                                    {chunk.chunk_type || 'unknown'}
                                  </span>
                                  </div>
                                  <div className="col-span-1 text-xs text-muted-foreground">
                                  {chunk.created_at ? new Date(chunk.created_at).toLocaleDateString() : 'N/A'}
                                  </div>
                                </button>
                                <div className="col-span-2 text-right flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedChunk(chunk);
                                      setShowEditModal(true);
                                      setEditError(null);
                                      setEditSuccess(null);
                                    }}
                                    className="text-purple-600 hover:text-purple-700"
                                    title="Edit entry"
                                  >
                                    <PencilIcon className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); confirmDelete(chunk); }}
                                    disabled={deletingId === chunk.id}
                                    className="text-red-600 hover:text-red-700"
                                    title="Delete"
                                  >
                                    <Trash2Icon className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-3 px-4 py-4 md:hidden">
                                <div className="flex items-start justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleRow(chunk.id)}
                                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                  >
                                    <div className="pt-0.5 text-muted-foreground">
                                      {isExpanded ? (
                                        <ChevronDownIcon className="w-4 h-4" />
                                      ) : (
                                        <ChevronRightIcon className="w-4 h-4" />
                                      )}
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                      <div className="font-medium">{chunk.table_name || 'N/A'}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {chunk.metadata?.dialect || chunk.schema_name || '-'}
                                      </div>
                                    </div>
                                  </button>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedChunk(chunk);
                                        setShowEditModal(true);
                                        setEditError(null);
                                        setEditSuccess(null);
                                      }}
                                      className="text-purple-600 hover:text-purple-700"
                                      title="Edit entry"
                                    >
                                      <PencilIcon className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); confirmDelete(chunk); }}
                                      disabled={deletingId === chunk.id}
                                      className="text-red-600 hover:text-red-700"
                                      title="Delete"
                                    >
                                      <Trash2Icon className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2 rounded-lg bg-muted/40 px-3 py-3 text-sm">
                                  <div>
                                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</span>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {(() => {
                                        if (chunk.chunk_type === 'glossary') {
                                          const { term, definition } = parseGlossaryContent(chunk.content);
                                          return `${term}: ${definition}`;
                                        } else if (chunk.chunk_type === 'gold_sql') {
                                          const { question } = parseGoldSQLContent(chunk.content);
                                          return question || 'SQL query';
                                        }
                                        return '-';
                                      })()}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-purple-100 px-2 py-1 text-xs text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                                      {chunk.chunk_type || 'unknown'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {chunk.created_at ? new Date(chunk.created_at).toLocaleDateString() : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Content */}
                              {isExpanded && (
                                <div className="px-4 py-4 border-t bg-muted/30 space-y-4">
                                  {chunk.metadata?.type === 'column' && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                      {chunk.schema_name && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">Database</p>
                                          <p className="text-sm font-medium">{chunk.schema_name}</p>
                                        </div>
                                      )}
                                      {chunk.metadata?.data_type && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">Data Type</p>
                                          <p className="text-sm font-mono">{chunk.metadata.data_type}</p>
                                        </div>
                                      )}
                                      {chunk.metadata?.dialect && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">Dialect</p>
                                          <p className="text-sm">{chunk.metadata.dialect}</p>
                                        </div>
                                      )}
                                      {chunk.metadata?.is_primary_key !== undefined && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">Primary Key</p>
                                          <p className="text-sm">{chunk.metadata.is_primary_key ? 'Yes' : 'No'}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="text-sm font-medium mb-2">Content:</h4>
                                    <div className="bg-background border rounded-lg p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                                      <AIAnalysisRenderer content={formatChunkContent(chunk.content, chunk.chunk_type)} />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Created:</span> {new Date(chunk.created_at).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Loading indicator and stats */}
                  <div className="flex flex-col gap-2 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      Showing {chunks.length} results
                      {sortBy && (
                        <span className="mt-1 block sm:ml-2 sm:mt-0 sm:inline">
                          • Sorted by {sortBy.replace('_', ' ')} ({sortOrder === 'asc' ? 'ascending' : 'descending'})
                        </span>
                      )}
                    </div>
                    {loadingMore && (
                      <div className="flex items-center gap-2">
                        <LoaderIcon className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Loading more...</span>
                      </div>
                    )}
                    {!loadingMore && chunks.length < pagination.total_count && (
                      <div className="text-xs">
                        Scroll down to load more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        {/* Knowledge base create modal */}
        <Dialog open={showCreateModal} onOpenChange={(open) => {
          if (!open && !isCreating) {
            // Modal is being closed
            if (hasAddedEntries) {
              refreshFirstPage();
            }
            setHasAddedEntries(false);
          }
          setShowCreateModal(open);
        }}>
          <DialogContent className="flex h-[95vh] max-h-[95vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="sticky top-0 z-10 border-b bg-background px-4 py-4 sm:px-6">
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                <BrainIcon className="w-5 h-5" />
                Train model
                {currentOrganization?.name && (
                  <span className="text-xs font-medium text-muted-foreground sm:ml-2">
                    for {currentOrganization.name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {orgId ? (
                <SchemaTraining
                  forceForm
                  bare
                  formId="kb-create-form"
                  onCreatingChange={setIsCreating}
                  onSuccess={() => setHasAddedEntries(true)}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Loading workspace information...</p>
                </div>
              )}
            </div>
            <div className="mt-auto flex flex-col-reverse gap-2 border-t bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  if (hasAddedEntries) {
                    refreshFirstPage();
                    setHasAddedEntries(false);
                  }
                  setShowCreateModal(false);
                }} 
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button form="kb-create-form" type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 sm:w-auto" disabled={isCreating}>
              {isCreating && <MagicalIndicator />}
                Train
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={(open) => {
          if (!isEditing) {
            setShowEditModal(open);
            if (!open) {
              setSelectedChunk(null);
              setEditError(null);
              setEditSuccess(null);
            }
          }
        }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PencilIcon className="w-5 h-5" />
                Edit Entry
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
              {selectedChunk && (
                <>
                  {/* Show chunk info */}
                  <div className="space-y-1 border-b pb-2 text-sm text-muted-foreground">
                    <div><span className="font-medium">Type:</span> {selectedChunk.chunk_type}</div>
                    {selectedChunk.table_name && (
                      <div><span className="font-medium">Table:</span> {selectedChunk.table_name}</div>
                    )}
                    {selectedChunk.metadata?.dialect && (
                      <div><span className="font-medium">Database:</span> {selectedChunk.metadata.dialect}</div>
                    )}
                  </div>

                  {/* Glossary fields */}
                  {selectedChunk.chunk_type === 'glossary' && (() => {
                    const { term, definition } = parseGlossaryContent(selectedChunk.content);
                    return (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={editGlossaryTermId}>Term *</Label>
                          <Input
                            id={editGlossaryTermId}
                            name="term"
                            defaultValue={term}
                            placeholder="e.g., active user"
                            required
                            disabled={isEditing}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={editGlossaryDefinitionId}>Definition *</Label>
                          <Textarea
                            id={editGlossaryDefinitionId}
                            name="definition"
                            defaultValue={definition}
                            placeholder="A user who has logged in within the last 30 days"
                            required
                            rows={6}
                            disabled={isEditing}
                          />
                        </div>
                      </>
                    );
                  })()}

                  {/* Gold SQL fields */}
                  {selectedChunk.chunk_type === 'gold_sql' && (() => {
                    const { question, sql } = parseGoldSQLContent(selectedChunk.content);
                    return (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={editGoldSqlQuestionId}>Question (optional)</Label>
                          <Input
                            id={editGoldSqlQuestionId}
                            name="question"
                            defaultValue={question}
                            placeholder="Natural language question"
                            disabled={isEditing}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={editGoldSqlQueryId}>SQL Query *</Label>
                          <Textarea
                            id={editGoldSqlQueryId}
                            name="sql"
                            defaultValue={sql}
                            placeholder="SELECT * FROM users WHERE..."
                            required
                            rows={8}
                            className="font-mono text-sm"
                            disabled={isEditing}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={editGoldSqlNameId}>Name (optional)</Label>
                            <Input
                              id={editGoldSqlNameId}
                              name="name"
                              defaultValue=""
                              placeholder="e.g., Active Users Count"
                              disabled={isEditing}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={editGoldSqlDescriptionId}>Description (optional)</Label>
                            <Input
                              id={editGoldSqlDescriptionId}
                              name="description"
                              defaultValue=""
                              placeholder="What this query does"
                              disabled={isEditing}
                            />
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Error and success messages */}
                  {editError && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-md">
                      {editError}
                    </div>
                  )}
                  {editSuccess && (
                    <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
                      {editSuccess}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowEditModal(false)}
                      disabled={isEditing}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isEditing}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                    >
                      {isEditing && <LoaderIcon className="w-4 h-4 animate-spin mr-2" />}
                      {isEditing ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteModal} onOpenChange={(open) => {
          if (!deletingId) {
            setShowDeleteModal(open);
            if (!open) {
              setChunkToDelete(null);
            }
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2Icon className="w-5 h-5" />
                Delete Entry
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {chunkToDelete && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete this {chunkToDelete.chunk_type === 'glossary' ? 'glossary entry' : 'gold SQL example'}?
                  </p>
                  
                  {chunkToDelete.chunk_type === 'glossary' && (() => {
                    const { term } = parseGlossaryContent(chunkToDelete.content);
                    return (
                      <div className="bg-muted p-3 rounded-md">
                        <p className="text-sm font-medium">{term}</p>
                      </div>
                    );
                  })()}
                  
                  {chunkToDelete.chunk_type === 'gold_sql' && (() => {
                    const { question } = parseGoldSQLContent(chunkToDelete.content);
                    return (
                      <div className="bg-muted p-3 rounded-md">
                        <p className="text-sm font-medium">{question || 'SQL Query'}</p>
                      </div>
                    );
                  })()}
                  
                  <p className="text-sm text-red-600 font-medium">
                    This action cannot be undone.
                  </p>
                </>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={!!deletingId}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={deleteChunk}
                  disabled={!!deletingId}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deletingId && <LoaderIcon className="w-4 h-4 animate-spin mr-2" />}
                  {deletingId ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </>
      )}

      <Dialog open={knowledgeGuideOpen} onOpenChange={setKnowledgeGuideOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 pr-6 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                <LightbulbIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </span>
              About the knowledge base
            </DialogTitle>
            <DialogDescription className="text-left text-base leading-relaxed">
              A library of trusted examples and terms that complements raw schema—so AI-assisted SQL follows
              patterns your team already validated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Two kinds of entries matter most: <span className="font-medium text-foreground">Gold SQL</span>{' '}
              pairs business questions with vetted queries, and <span className="font-medium text-foreground">Glossary</span>{' '}
              locks in definitions analysts use. Together they reduce bad joins, wrong metrics, and ambiguous
              jargon when the model reasons over your data.
            </p>
            <p className="font-medium text-foreground">How to use this page</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>
                <span className="text-foreground">Train model</span> opens the form to add gold SQL or glossary
                rows for a table.
              </li>
              <li>Filter and search to audit what is already embedded; open a row to edit or delete.</li>
              <li>
                <span className="text-foreground">Export Gold SQL</span> downloads approved examples for review
                or backup.
              </li>
            </ul>
            <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs leading-relaxed">
              The yellow tip strip can be dismissed; use{' '}
              <span className="font-medium text-foreground">About knowledge base</span> anytime to reopen this
              guide.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dismissKnowledgeTip();
                setKnowledgeGuideOpen(false);
              }}
            >
              Hide reminder strip
            </Button>
            <Button type="button" onClick={() => setKnowledgeGuideOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

