"use client"

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DatabaseIcon,
  TableIcon,
  SearchIcon,
  LoaderIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PencilLineIcon,
  LightbulbIcon,
  XIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackPageView, trackEvent } from '@/lib/analytics/mixpanel';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';

interface DatabaseItem {
  id: string;
  database_name: string;
  dialect: string;
  table_count: number;
  /** When this schema snapshot row was created (sync time). */
  created_at?: string;
  updated_at?: string;
}

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

interface SchemaChunksPagination {
  current_page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

const SCHEMA_PAGE_SIZE = 100;

const ANNOTATION_TIP_DISMISSED_KEY = 'querypanel.schemaManager.annotationTipDismissed';

/** Shared styles for click-to-edit schema annotations (table + column). */
const editableAnnotationTriggerClass =
  'group relative w-full rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-2.5 text-left transition-colors hover:border-primary/45 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function chunkTableName(chunk: SchemaChunk): string {
  return chunk.metadata?.table || chunk.table_name || '';
}

/** Collapse multi-line overview / chunk text to one line for compact display. */
function singleLineAnnotationPreview(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Absolute local date/time for tooltips and the remove dialog. */
function formatSchemaSyncedAbsolute(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Compact label for list rows (relative when recent). */
function formatSchemaSyncedShort(iso: string | undefined | null): string | null {
  const abs = formatSchemaSyncedAbsolute(iso);
  if (!abs || !iso) return abs;
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return abs;
  const diffSec = Math.floor(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (diffSec < 45) return rtf.format(-diffSec, 'second');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 36) return rtf.format(-diffHr, 'hour');
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return rtf.format(-diffDay, 'day');
  return abs;
}

export default function SchemaManagerPage() {
  const { currentOrganizationId, loading: orgLoading } = useOrganizationContext();
  const orgId = currentOrganizationId;

  // Selection state — database list rows are keyed by table_schemas.id (unique); database_name may repeat
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Data state
  const [databases, setDatabases] = useState<DatabaseItem[]>([]);
  /** Column chunks for the currently selected table only (paginated). */
  const [columnChunks, setColumnChunks] = useState<SchemaChunk[]>([]);
  /** Table overview chunks for the middle panel (paginated). */
  const [tableOverviewChunks, setTableOverviewChunks] = useState<SchemaChunk[]>([]);
  const [selectedTableOverviewChunk, setSelectedTableOverviewChunk] = useState<SchemaChunk | null>(null);

  const [overviewPagination, setOverviewPagination] = useState<SchemaChunksPagination | null>(null);
  const [columnPagination, setColumnPagination] = useState<SchemaChunksPagination | null>(null);

  // UI state
  const [overviewPage, setOverviewPage] = useState(1);
  const [columnPage, setColumnPage] = useState(1);
  const [tableSearchInput, setTableSearchInput] = useState('');
  const [debouncedTableSearch, setDebouncedTableSearch] = useState('');
  const [columnSearchInput, setColumnSearchInput] = useState('');
  const [debouncedColumnSearch, setDebouncedColumnSearch] = useState('');

  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingTableOverviews, setIsLoadingTableOverviews] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapsible panels
  const [isDatabasePanelCollapsed, setIsDatabasePanelCollapsed] = useState(false);
  const [isTablePanelCollapsed, setIsTablePanelCollapsed] = useState(false);

  // Editing state
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingTableDescription, setEditingTableDescription] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [annotationGuideOpen, setAnnotationGuideOpen] = useState(false);
  /** null until localStorage is read (avoids SSR/client mismatch). */
  const [annotationTipDismissed, setAnnotationTipDismissed] = useState<boolean | null>(null);

  const [schemaDeleteTarget, setSchemaDeleteTarget] = useState<DatabaseItem | null>(null);
  const [isDeletingSchema, setIsDeletingSchema] = useState(false);

  // Track page view
  useEffect(() => {
    trackPageView("Schema Manager Page");
  }, []);

  useEffect(() => {
    try {
      setAnnotationTipDismissed(localStorage.getItem(ANNOTATION_TIP_DISMISSED_KEY) === '1');
    } catch {
      setAnnotationTipDismissed(false);
    }
  }, []);

  const dismissAnnotationTip = () => {
    try {
      localStorage.setItem(ANNOTATION_TIP_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setAnnotationTipDismissed(true);
  };

  const selectedDatabaseRow = useMemo(
    () => databases.find((d) => d.id === selectedDatabaseId) ?? null,
    [databases, selectedDatabaseId],
  );
  const selectedLogicalDbName = selectedDatabaseRow?.database_name ?? null;

  // Fetch databases
  useEffect(() => {
    const fetchDatabases = async () => {
      if (!orgId) {
        setDatabases([]);
        return;
      }
      setIsLoadingDatabases(true);
      setError(null);
      try {
        const response = await fetch('/api/databases', {
          headers: { 'x-organization-id': orgId },
        });
        if (!response.ok) throw new Error('Failed to fetch databases');
        const data = await response.json();
        setDatabases(data.databases || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch databases');
      } finally {
        setIsLoadingDatabases(false);
      }
    };
    fetchDatabases();
  }, [orgId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTableSearch(tableSearchInput), 350);
    return () => window.clearTimeout(t);
  }, [tableSearchInput]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedColumnSearch(columnSearchInput), 350);
    return () => window.clearTimeout(t);
  }, [columnSearchInput]);

  useEffect(() => {
    setOverviewPage(1);
  }, [debouncedTableSearch]);

  useEffect(() => {
    setColumnPage(1);
  }, [debouncedColumnSearch]);

  useEffect(() => {
    setColumnPage(1);
    setColumnSearchInput('');
    setDebouncedColumnSearch('');
  }, [selectedTable]);

  useEffect(() => {
    setOverviewPage(1);
    setTableSearchInput('');
    setDebouncedTableSearch('');
    setColumnPage(1);
    setColumnSearchInput('');
    setDebouncedColumnSearch('');
    setSelectedTable(null);
    setTableOverviewChunks([]);
    setOverviewPagination(null);
    setColumnChunks([]);
    setColumnPagination(null);
    setSelectedTableOverviewChunk(null);
  }, [selectedDatabaseId, selectedLogicalDbName]);

  // Paginated table list (table_overview chunks)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orgId || !selectedLogicalDbName) {
        setTableOverviewChunks([]);
        setOverviewPagination(null);
        return;
      }
      setIsLoadingTableOverviews(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          chunk_type: 'table_overview',
          target_db: selectedLogicalDbName,
          page: String(overviewPage),
          limit: String(SCHEMA_PAGE_SIZE),
        });
        if (debouncedTableSearch.trim()) {
          params.set('search', debouncedTableSearch.trim());
        }
        const response = await fetch(`/api/schema-chunks?${params.toString()}`, {
          headers: { 'x-organization-id': orgId },
        });
        if (!response.ok) throw new Error('Failed to fetch tables');
        const data = await response.json();
        if (cancelled) return;
        setTableOverviewChunks(data.chunks || []);
        setOverviewPagination(data.pagination ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch schema');
        }
      } finally {
        if (!cancelled) setIsLoadingTableOverviews(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedLogicalDbName, selectedDatabaseId, overviewPage, debouncedTableSearch]);

  // Table overview row for description (single fetch by table name)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orgId || !selectedLogicalDbName || !selectedTable) {
        setSelectedTableOverviewChunk(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          chunk_type: 'table_overview',
          target_db: selectedLogicalDbName,
          table_name: selectedTable,
          page: '1',
          limit: '1',
        });
        const response = await fetch(`/api/schema-chunks?${params.toString()}`, {
          headers: { 'x-organization-id': orgId },
        });
        if (!response.ok) throw new Error('Failed to fetch table overview');
        const data = await response.json();
        if (cancelled) return;
        setSelectedTableOverviewChunk(data.chunks?.[0] ?? null);
      } catch {
        if (!cancelled) setSelectedTableOverviewChunk(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedLogicalDbName, selectedTable]);

  // Paginated columns for selected table
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orgId || !selectedLogicalDbName || !selectedTable) {
        setColumnChunks([]);
        setColumnPagination(null);
        return;
      }
      setIsLoadingColumns(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          chunk_type: 'column',
          target_db: selectedLogicalDbName,
          table_name: selectedTable,
          page: String(columnPage),
          limit: String(SCHEMA_PAGE_SIZE),
        });
        if (debouncedColumnSearch.trim()) {
          params.set('search', debouncedColumnSearch.trim());
        }
        const response = await fetch(`/api/schema-chunks?${params.toString()}`, {
          headers: { 'x-organization-id': orgId },
        });
        if (!response.ok) throw new Error('Failed to fetch columns');
        const data = await response.json();
        if (cancelled) return;
        const chunks: SchemaChunk[] = data.chunks || [];
        chunks.sort((a, b) => {
          const ca = a.metadata?.column || '';
          const cb = b.metadata?.column || '';
          return ca.localeCompare(cb);
        });
        setColumnChunks(chunks);
        setColumnPagination(data.pagination ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch columns');
        }
      } finally {
        if (!cancelled) setIsLoadingColumns(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedLogicalDbName, selectedTable, columnPage, debouncedColumnSearch]);

  const selectedTableDescription = selectedTableOverviewChunk?.content ?? '';

  const selectedTableColumns = columnChunks;

  // Save annotation
  const saveAnnotation = useCallback(async (targetIdentifier: string, content: string): Promise<boolean> => {
    if (!orgId) return false;
    setIsSaving(true);
    try {
      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          target_identifier: targetIdentifier,
          content,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to save annotation');
      }
      trackEvent("Schema Annotation Saved", { target_identifier: targetIdentifier });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [orgId]);

  // Handle column description save
  const handleColumnDescriptionSave = async (chunk: SchemaChunk) => {
    const targetIdentifier = chunk.metadata?.target_identifier ||
      `${chunk.metadata?.database || chunk.schema_name}.${chunk.metadata?.table || chunk.table_name}.${chunk.metadata?.column}`;
    const success = await saveAnnotation(targetIdentifier, editValue);

    if (success) {
      setColumnChunks((prev) =>
        prev.map((c) =>
          String(c.id) === String(chunk.id) ? { ...c, content: editValue } : c,
        ),
      );
    }

    setEditingColumn(null);
    setEditValue('');
  };

  // Handle table description save
  const handleTableDescriptionSave = async () => {
    if (!selectedLogicalDbName || !selectedTable) return;
    const targetIdentifier = `${selectedLogicalDbName}.${selectedTable}`;
    const success = await saveAnnotation(targetIdentifier, editValue);

    if (success) {
      setSelectedTableOverviewChunk((prev) =>
        prev ? { ...prev, content: editValue } : prev,
      );
      setTableOverviewChunks((prev) =>
        prev.map((c) =>
          chunkTableName(c) === selectedTable ? { ...c, content: editValue } : c,
        ),
      );
    }

    setEditingTableDescription(false);
    setEditValue('');
  };

  // Get description from column content
  const getColumnDescription = (chunk: SchemaChunk): string => {
    return chunk.content || '';
  };

  const confirmRemoveSyncedSchema = async () => {
    if (!orgId || !schemaDeleteTarget) return;
    setIsDeletingSchema(true);
    setError(null);
    try {
      const response = await fetch('/api/schema-chunks', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ table_schema_id: schemaDeleteTarget.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
        removed_embeddings?: boolean;
      };
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to remove schema');
      }
      const removedId = schemaDeleteTarget.id;
      setDatabases((prev) => prev.filter((d) => d.id !== removedId));
      if (selectedDatabaseId === removedId) {
        setSelectedDatabaseId(null);
      }
      if (typeof data.warning === 'string') {
        setError(data.warning);
      }
      trackEvent('Schema Manager Removed Synced Schema', {
        database_name: schemaDeleteTarget.database_name,
        removed_embeddings: data.removed_embeddings === true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove schema');
    } finally {
      setIsDeletingSchema(false);
      setSchemaDeleteTarget(null);
    }
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <TableIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Schema Manager
            </h1>
            <p className="text-muted-foreground">
              Inspect synced schema and annotations that steer AI-generated SQL and charts.
            </p>
          </div>
        </div>
        <Card className="relative overflow-hidden border-purple-200 dark:border-purple-800">
          <CardContent className="pt-12 text-center space-y-4">
            <div className="text-6xl mb-2">🚀</div>
            <h2 className="text-xl font-semibold">Let&apos;s create a workspace</h2>
            <p className="text-muted-foreground">Get started by setting up your workspace first</p>
            <a href="/dashboard/home">
              <Button className="mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
                Go to home
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col space-y-6 lg:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <TableIcon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Schema Manager
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Inspect synced tables and columns, and edit annotations that steer AI-generated SQL and charts.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 border-dashed"
          onClick={() => setAnnotationGuideOpen(true)}
        >
          <LightbulbIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          About annotations
        </Button>
      </div>

      {annotationTipDismissed === false && (
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
              <span className="text-foreground">Tip:</span> annotations add business context on top of raw
              schema—the AI sees them when generating SQL.{' '}
              <button
                type="button"
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                onClick={() => setAnnotationGuideOpen(true)}
              >
                Open guide
              </button>
            </p>
          </div>
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
            aria-label="Dismiss tip"
            onClick={dismissAnnotationTip}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Three-panel layout */}
      <div
        className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,200px)_minmax(0,200px)_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border"
      >
        {/* Left panel: Database list */}
        <div className={cn(
          "flex min-h-[220px] flex-col overflow-hidden rounded-lg border bg-background transition-all duration-300 lg:min-h-0 lg:rounded-none lg:border-0 lg:border-r",
          isDatabasePanelCollapsed ? "lg:w-14" : "lg:w-[200px]",
          isDatabasePanelCollapsed && "max-lg:min-h-0"
        )}>
          {/* Collapse toggle */}
          <button
            onClick={() => setIsDatabasePanelCollapsed(!isDatabasePanelCollapsed)}
            className="p-3 border-b hover:bg-muted/50 transition-colors flex items-center justify-center"
            title={isDatabasePanelCollapsed ? "Expand databases" : "Collapse databases"}
          >
            <ChevronRightIcon className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              !isDatabasePanelCollapsed && "rotate-180"
            )} />
          </button>

          {/* Content */}
          <div className={cn("flex-1 overflow-y-auto", isDatabasePanelCollapsed && "max-lg:hidden")}>
            {isLoadingDatabases ? (
              <div className="flex items-center justify-center py-8">
                <LoaderIcon className="w-5 h-5 animate-spin text-purple-600" />
              </div>
            ) : databases.length === 0 ? (
              !isDatabasePanelCollapsed && (
                <div className="text-center py-8 text-sm text-muted-foreground px-2">
                  <DatabaseIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No databases</p>
                </div>
              )
            ) : (
              <div className={cn("p-2", isDatabasePanelCollapsed && "flex flex-col items-center gap-1")}>
                {databases.map((db) =>
                  isDatabasePanelCollapsed ? (
                    <button
                      key={db.id}
                      type="button"
                      onClick={() => setSelectedDatabaseId(db.id)}
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                        selectedDatabaseId === db.id
                          ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                      title={
                        [db.database_name, formatSchemaSyncedAbsolute(db.created_at)]
                          .filter(Boolean)
                          .join(' · ') || db.database_name
                      }
                    >
                      <DatabaseIcon className="w-5 h-5" />
                    </button>
                  ) : (
                    <div
                      key={db.id}
                      className={cn(
                        'group relative mb-1 rounded-lg border border-transparent transition-colors',
                        selectedDatabaseId === db.id
                          ? 'border-purple-200/70 bg-purple-100/90 dark:border-purple-800/50 dark:bg-purple-900/45'
                          : 'hover:border-border/80 hover:bg-muted/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDatabaseId(db.id)}
                        className={cn(
                          'w-full min-w-0 text-left px-3 py-2 pr-10 text-sm transition-colors rounded-lg',
                          selectedDatabaseId === db.id
                            ? 'text-purple-800 dark:text-purple-200'
                            : 'text-foreground',
                        )}
                        title={
                          [db.database_name, formatSchemaSyncedAbsolute(db.created_at)]
                            .filter(Boolean)
                            .join(' · ') || db.database_name
                        }
                      >
                        <div className="font-medium leading-snug truncate pr-0.5">
                          {db.database_name}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="shrink-0 rounded bg-background/60 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide dark:bg-background/20">
                            {db.dialect}
                          </span>
                          <span className="tabular-nums">{db.table_count} tables</span>
                        </div>
                        {formatSchemaSyncedShort(db.created_at) ? (
                          <div
                            className="mt-1 text-[10px] leading-tight text-muted-foreground tabular-nums"
                            title={
                              formatSchemaSyncedAbsolute(db.created_at) ?? undefined
                            }
                          >
                            Synced {formatSchemaSyncedShort(db.created_at)}
                          </div>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        title="Remove synced schema"
                        aria-label={[
                          'Remove synced schema',
                          db.database_name,
                          formatSchemaSyncedAbsolute(db.created_at),
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        className={cn(
                          'absolute right-1 top-1.5 z-[1] flex h-7 w-7 items-center justify-center rounded-md',
                          'text-muted-foreground/80 opacity-80 transition-[color,opacity,background-color]',
                          'hover:bg-destructive/10 hover:text-destructive hover:opacity-100',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          'group-hover:opacity-100',
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchemaDeleteTarget(db);
                        }}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Middle panel: Tables list */}
        <div className={cn(
          "flex min-h-[220px] flex-col overflow-hidden rounded-lg border bg-background transition-all duration-300 lg:min-h-0 lg:rounded-none lg:border-0 lg:border-r",
          isTablePanelCollapsed ? "lg:w-14" : "lg:w-[200px]",
          isTablePanelCollapsed && "max-lg:min-h-0"
        )}>
          {/* Collapse toggle */}
          <button
            onClick={() => setIsTablePanelCollapsed(!isTablePanelCollapsed)}
            className="p-3 border-b hover:bg-muted/50 transition-colors flex items-center justify-center"
            title={isTablePanelCollapsed ? "Expand tables" : "Collapse tables"}
          >
            <ChevronRightIcon className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              !isTablePanelCollapsed && "rotate-180"
            )} />
          </button>

          {/* Search tables (server-side: overview chunk content) */}
          {!isTablePanelCollapsed && (
            <div className="p-2 border-b space-y-1">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tables…"
                  value={tableSearchInput}
                  onChange={(e) => setTableSearchInput(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  aria-label="Search tables"
                />
              </div>
              {overviewPagination && overviewPagination.total_count > 0 && (
                <p className="text-[10px] text-muted-foreground px-0.5 tabular-nums">
                  {overviewPagination.total_count} table{overviewPagination.total_count === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!selectedDatabaseId ? (
              !isTablePanelCollapsed && (
                <div className="text-center py-8 text-sm text-muted-foreground px-2">
                  <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Select database</p>
                </div>
              )
            ) : isLoadingTableOverviews ? (
              <div className="flex items-center justify-center py-8">
                <LoaderIcon className="w-5 h-5 animate-spin text-indigo-600" />
              </div>
            ) : tableOverviewChunks.length === 0 ? (
              !isTablePanelCollapsed && (
                <div className="text-center py-8 text-sm text-muted-foreground px-2">
                  <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{debouncedTableSearch.trim() ? 'No matching tables' : 'No tables'}</p>
                </div>
              )
            ) : (
              <div className={cn("p-2", isTablePanelCollapsed && "flex flex-col items-center gap-1")}>
                {tableOverviewChunks.map((chunk) => {
                  const name = chunkTableName(chunk);
                  if (!name) return null;
                  const colCount =
                    chunk.column_count ??
                    (chunk.metadata as { column_count?: number } | undefined)?.column_count;
                  return (
                    <button
                      key={String(chunk.id)}
                      type="button"
                      onClick={() => setSelectedTable(name)}
                      className={cn(
                        "transition-colors",
                        isTablePanelCollapsed
                          ? cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              selectedTable === name
                                ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                                : "hover:bg-muted text-muted-foreground",
                            )
                          : cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm mb-1",
                              selectedTable === name
                                ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                                : "hover:bg-muted",
                            ),
                      )}
                      title={name}
                    >
                      {isTablePanelCollapsed ? (
                        <TableIcon className="w-5 h-5" />
                      ) : (
                        <>
                          <div className="font-medium truncate">{name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                            {typeof colCount === 'number' ? `${colCount} columns` : 'Columns'}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!isTablePanelCollapsed &&
            overviewPagination &&
            overviewPagination.total_pages > 1 &&
            selectedDatabaseId && (
              <div className="flex items-center justify-between gap-1 p-2 border-t bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  disabled={overviewPage <= 1 || isLoadingTableOverviews}
                  onClick={() => setOverviewPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous table page"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </Button>
                <span className="text-[11px] text-muted-foreground tabular-nums text-center truncate shrink min-w-0">
                  {overviewPage} / {overviewPagination.total_pages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  disabled={
                    overviewPage >= overviewPagination.total_pages || isLoadingTableOverviews
                  }
                  onClick={() =>
                    setOverviewPage((p) => Math.min(overviewPagination.total_pages, p + 1))
                  }
                  aria-label="Next table page"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            )}
        </div>

        {/* Right panel: Column details */}
        <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border bg-background lg:min-h-0 lg:rounded-none lg:border-0">
          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <TableIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a table to view its columns</p>
              </div>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="p-6 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{selectedTable}</h2>
                  <span className="px-2 py-1 border rounded text-xs font-medium text-muted-foreground">
                    Table
                  </span>
                </div>

                {/* Table annotation (editable) */}
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Table annotation
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Saved as business context for AI · click to edit
                    </span>
                  </div>
                  {editingTableDescription ? (
                    <div className="space-y-2 rounded-md border border-border bg-card p-3 shadow-sm">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="Describe this table for your team and for the AI…"
                        className="text-sm min-h-[80px] resize-y"
                        rows={3}
                        autoFocus
                        aria-label="Edit table annotation"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleTableDescriptionSave}
                          disabled={isSaving}
                        >
                          {isSaving ? <LoaderIcon className="w-3 h-3 animate-spin" /> : <CheckIcon className="w-3 h-3" />}
                          <span className="ml-1">Save</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingTableDescription(false);
                            setEditValue('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTableDescription(true);
                        setEditValue(selectedTableDescription);
                      }}
                      className={cn(
                        editableAnnotationTriggerClass,
                        'flex min-h-10 items-center gap-2.5 overflow-hidden py-2',
                      )}
                      title={
                        selectedTableDescription
                          ? selectedTableDescription
                          : 'Add table annotation'
                      }
                      aria-label={
                        selectedTableDescription
                          ? 'Edit table annotation'
                          : 'Add table annotation'
                      }
                    >
                      <PencilLineIcon
                        className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden
                      />
                      {selectedTableDescription ? (
                        <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
                          {singleLineAnnotationPreview(selectedTableDescription)}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground italic">
                          Add an annotation for this table (purpose, grain, caveats)…
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Column search + paginated table */}
              <div className="flex-1 flex flex-col min-h-0 border-t">
                <div className="px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between shrink-0">
                  <div className="relative max-w-md w-full">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search column text…"
                      value={columnSearchInput}
                      onChange={(e) => setColumnSearchInput(e.target.value)}
                      className="pl-8 h-9 text-sm"
                      aria-label="Search columns"
                    />
                  </div>
                  {columnPagination && columnPagination.total_count > 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {columnPagination.total_count} column{columnPagination.total_count === 1 ? '' : 's'}
                      {debouncedColumnSearch.trim() ? ' (filtered)' : ''}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 min-h-0 relative">
                  {isLoadingColumns && (
                    <div
                      className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-background/60 backdrop-blur-[1px]"
                      aria-busy="true"
                    >
                      <LoaderIcon className="w-6 h-6 animate-spin text-indigo-600" />
                    </div>
                  )}
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background z-[1]">
                      <tr className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b">
                        <th className="text-left py-3 w-[25%]">Column Name</th>
                        <th className="text-left py-3 w-[20%]">Data Type</th>
                        <th className="text-left py-3 w-[12%]">Properties</th>
                        <th className="text-left py-3 w-[43%]">
                          <span className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                            <span>Annotation</span>
                            <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                              editable
                            </span>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className={cn(isLoadingColumns && 'opacity-50 pointer-events-none')}>
                      {!isLoadingColumns && selectedTableColumns.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                            {debouncedColumnSearch.trim() ? 'No columns match this search' : 'No columns'}
                          </td>
                        </tr>
                      ) : (
                        selectedTableColumns.map((chunk) => {
                      const columnName = chunk.metadata?.column || '';
                      const dataType = chunk.metadata?.data_type || '';
                      const isPrimaryKey = chunk.metadata?.is_primary_key || false;
                      const description = getColumnDescription(chunk);
                      const chunkKey = String(chunk.id);
                      const isEditing = editingColumn === chunkKey;

                      return (
                        <tr key={chunkKey} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-4">
                            <span className="font-medium">{columnName}</span>
                          </td>
                          <td className="py-4">
                            <code className="text-sm text-muted-foreground font-mono">
                              {dataType}
                            </code>
                          </td>
                          <td className="py-4">
                            {isPrimaryKey && (
                              <span className="inline-flex items-center px-2 py-1 bg-amber-500/20 text-amber-500 rounded text-xs font-medium">
                                PK
                              </span>
                            )}
                          </td>
                          <td className="py-4">
                            {isEditing ? (
                              <div className="flex items-center gap-2 min-w-[240px]">
                                <Input
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="h-8 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleColumnDescriptionSave(chunk);
                                    } else if (e.key === 'Escape') {
                                      setEditingColumn(null);
                                      setEditValue('');
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={() => handleColumnDescriptionSave(chunk)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <LoaderIcon className="w-3 h-3 animate-spin" /> : <CheckIcon className="w-3 h-3" />}
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingColumn(chunkKey);
                                  setEditValue(description);
                                }}
                                className={cn(
                                  editableAnnotationTriggerClass,
                                  'flex min-h-9 items-center gap-2 overflow-hidden py-1.5',
                                )}
                                title={description || `Add annotation for ${columnName}`}
                                aria-label={
                                  description
                                    ? `Edit annotation for column ${columnName}`
                                    : `Add annotation for column ${columnName}`
                                }
                              >
                                <PencilLineIcon
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                                  aria-hidden
                                />
                                {description ? (
                                  <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
                                    {singleLineAnnotationPreview(description)}
                                  </span>
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground italic">
                                    Add annotation…
                                  </span>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                      )}
                    </tbody>
                  </table>
                </div>

                {columnPagination && columnPagination.total_pages > 1 && (
                  <div className="flex items-center justify-between gap-2 px-6 py-2 border-t bg-muted/10 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={columnPage <= 1 || isLoadingColumns}
                      onClick={() => setColumnPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeftIcon className="w-4 h-4 mr-1" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Page {columnPage} of {columnPagination.total_pages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={columnPage >= columnPagination.total_pages || isLoadingColumns}
                      onClick={() =>
                        setColumnPage((p) => Math.min(columnPagination.total_pages, p + 1))
                      }
                    >
                      Next
                      <ChevronRightIcon className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={schemaDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingSchema) setSchemaDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove synced schema?</DialogTitle>
            <DialogDescription asChild>
              <div className="text-left text-sm text-muted-foreground space-y-2">
                <p>
                  This removes the snapshot for{' '}
                  <span className="font-medium text-foreground">
                    {schemaDeleteTarget?.database_name}
                  </span>{' '}
                  from Schema Manager. If no other snapshot exists for this logical database, table and column
                  schema embeddings for it are removed; gold SQL and glossary entries in the Knowledge base are
                  kept until you delete them there. Otherwise only this history entry is removed.
                </p>
                {schemaDeleteTarget &&
                formatSchemaSyncedAbsolute(schemaDeleteTarget.created_at) ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-relaxed">
                    <span className="font-medium text-foreground">This snapshot</span> was synced on{' '}
                    <span className="tabular-nums text-foreground">
                      {formatSchemaSyncedAbsolute(schemaDeleteTarget.created_at)}
                    </span>
                    . Use this to tell duplicate database names apart when cleaning up old syncs.
                  </p>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingSchema}
              onClick={() => setSchemaDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingSchema}
              onClick={() => void confirmRemoveSyncedSchema()}
            >
              {isDeletingSchema ? (
                <>
                  <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={annotationGuideOpen} onOpenChange={setAnnotationGuideOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 pr-6 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                <LightbulbIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </span>
              About schema annotations
            </DialogTitle>
            <DialogDescription className="text-left text-base leading-relaxed">
              Short notes on tables and columns become business context for AI-assisted SQL—beyond raw types and
              names.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Each annotation is tied to one table or column. When schema is embedded, matching notes are merged
              into what the model sees, so it can resolve ambiguous names, understand metrics, and follow how
              your org defines filters and rules.
            </p>
            <p className="font-medium text-foreground">Ideas for what to write</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>What revenue, activation, or an “active” row means for you</li>
              <li>Preferred joins, time zones, and the grain analysts expect</li>
              <li>PII, tenure, segmentation, or compliance caveats</li>
              <li>Glossary terms and dashboard conventions your team shares</li>
            </ul>
            <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs leading-relaxed">
              Edit any dashed field on this page to update an annotation. The yellow tip strip can be dismissed;
              use <span className="font-medium text-foreground">About annotations</span> anytime to reopen this
              guide.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dismissAnnotationTip();
                setAnnotationGuideOpen(false);
              }}
            >
              Hide reminder strip
            </Button>
            <Button type="button" onClick={() => setAnnotationGuideOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
