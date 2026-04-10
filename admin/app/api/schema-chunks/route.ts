import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import { removeTableSchemaSnapshot } from '@/lib/schema-snapshot-delete/remove-schema-snapshot';
import { createSupabaseSchemaSnapshotDeletionAdmin } from '@/lib/schema-snapshot-delete/supabase-schema-snapshot-admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const schemaNameFilter = searchParams.get('schema_name');
    const tableNameFilter = searchParams.get('table_name');
    const chunkTypeFilter = searchParams.get('chunk_type');
    const targetDbFilter = searchParams.get('target_db');
    const searchFilter = searchParams.get('search');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    // Validate sort column
    const allowedSortColumns = ['schema_name', 'table_name', 'target_db', 'chunk_type', 'column_count', 'created_at'];
    const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    // Map sortable fields to JSON path in metadata
    const sortColumnToJsonPath: Record<string, string> = {
      // schema_name and target_db both map to `database` in v4 metadata
      schema_name: 'metadata->>database',
      table_name: 'metadata->>table',
      target_db: 'metadata->>database',
      chunk_type: 'metadata->>type',
      column_count: 'metadata->>column_count',
      created_at: 'metadata->>created_at',
    };

    // Build query against v4 table using service role; filter by organization in metadata
    const admin = createAdminClient();
    let query = admin
      .from('schema_chunks')
      .select('id, content, metadata', { count: 'exact' })
      .contains('metadata', { organization_id: orgId });

    // Apply filters
    if (schemaNameFilter) {
      query = query.contains('metadata', { database: schemaNameFilter });
    }
    if (tableNameFilter) {
      query = query.contains('metadata', { table: tableNameFilter });
    }
    if (chunkTypeFilter) {
      const chunkTypes = chunkTypeFilter
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean);

      if (chunkTypes.length === 1) {
        query = query.contains('metadata', { type: chunkTypes[0] });
      } else if (chunkTypes.length > 1) {
        const orFilter = chunkTypes
          .map((type) => `metadata->>type.eq.${type}`)
          .join(',');
        query = query.or(orFilter);
      }
    }
    if (targetDbFilter) {
      query = query.contains('metadata', { database: targetDbFilter });
    }
    if (searchFilter) {
      query = query.ilike('content', `%${searchFilter}%`);
    }
    if (startDate) {
      query = query.gte('metadata->>created_at' as unknown as string, startDate);
    }
    if (endDate) {
      query = query.lte('metadata->>created_at' as unknown as string, endDate);
    }

    // Apply sorting and pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sortPath = sortColumnToJsonPath[validSortBy] || 'metadata->>created_at';

    // Cast through unknown to satisfy typings for JSON path order
    // Primary sort
    query = query.order(sortPath as unknown as string, { ascending: validSortOrder === 'asc' });

    // Secondary sort by column name (for consistency when primary sort values are equal)
    if (validSortBy !== 'column_name') {
      query = query.order('metadata->>column' as unknown as string, { ascending: true });
    }

    // Apply pagination
    query = query.range(from, to);

    const data = await query;
    const { data: chunks, error: chunksError, count } = data;

    if (chunksError) {
      console.error('Error fetching schema chunks:', chunksError);
      return NextResponse.json({ error: 'Failed to fetch schema chunks' }, { status: 500 });
    }

    // Get stats (without pagination)
    let statsQuery = admin
      .from('schema_chunks')
      .select('metadata')
      .contains('metadata', { organization_id: orgId });

    // Apply same filters to stats
    if (schemaNameFilter) {
      statsQuery = statsQuery.contains('metadata', { database: schemaNameFilter });
    }
    if (tableNameFilter) {
      statsQuery = statsQuery.contains('metadata', { table: tableNameFilter });
    }
    if (chunkTypeFilter) {
      const chunkTypes = chunkTypeFilter
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean);

      if (chunkTypes.length === 1) {
        statsQuery = statsQuery.contains('metadata', { type: chunkTypes[0] });
      } else if (chunkTypes.length > 1) {
        const orFilter = chunkTypes
          .map((type) => `metadata->>type.eq.${type}`)
          .join(',');
        statsQuery = statsQuery.or(orFilter);
      }
    }
    if (targetDbFilter) {
      statsQuery = statsQuery.contains('metadata', { database: targetDbFilter });
    }
    if (searchFilter) {
      statsQuery = statsQuery.ilike('content', `%${searchFilter}%`);
    }
    if (startDate) {
      statsQuery = statsQuery.gte('metadata->>created_at' as unknown as string, startDate);
    }
    if (endDate) {
      statsQuery = statsQuery.lte('metadata->>created_at' as unknown as string, endDate);
    }

    const { data: statsData, error: statsError } = await statsQuery;

    if (statsError) {
      console.error('Error fetching stats:', statsError);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    // Calculate stats
    type V4Metadata = {
      hash?: string;
      dialect?: string;
      chunk_id?: string;
      database?: string;
      type?: string;
      chunk_type?: string;
      created_at?: string;
      importance?: number;
      table?: string;
      table_name?: string;
      column?: string;
      column_count?: number;
      organization_id?: string;
      column_names?: string[] | null;
      sql?: string | null;
      data_type?: string;
      is_primary_key?: boolean;
    };
    type StatsRow = { metadata: V4Metadata };

    const uniqueDatasources = new Set(
      (statsData as StatsRow[] | null | undefined || [])
        .map((d) => (d?.metadata?.database ?? null))
        .filter((db): db is string => db !== null)
    );
    const uniqueSchemas = new Set(
      (statsData as StatsRow[] | null | undefined || [])
        .map((d) => d?.metadata?.database)
        .filter((v): v is string => Boolean(v))
    );
    const uniqueTables = new Set(
      (statsData as StatsRow[] | null | undefined || [])
        .map((d) => d?.metadata?.table || d?.metadata?.table_name)
        .filter((v): v is string => Boolean(v))
    );

    const stats = {
      total_count: count || 0,
      datasource_count: uniqueDatasources.size,
      schema_count: uniqueSchemas.size,
      table_count: uniqueTables.size,
    };

    const pagination = {
      current_page: page,
      page_size: limit,
      total_count: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    };

    // Map v4 rows to UI expected shape
    type V4Row = { id: string; content: string; metadata: V4Metadata };
    const mapped = ((chunks || []) as unknown as V4Row[]).map((row) => {
      const meta: V4Metadata = row?.metadata ?? {};
      const chunkType = meta.type ?? meta.chunk_type ?? '';
      const isGold = chunkType === 'gold_sql';
      let content = row.content ?? '';
      if (isGold && meta.sql) {
        const hasFence = content.includes('```sql');
        const sqlBlock = `\n\n\`\`\`sql\n${meta.sql}\n\`\`\``;
        content = hasFence ? content : `${content}${sqlBlock}`;
      }
      return {
        id: row.id,
        schema_name: meta.database ?? '',
        table_name: meta.table ?? meta.table_name ?? '',
        target_db: meta.database ?? null,
        chunk_type: chunkType,
        content,
        column_names: meta.column_names ?? null,
        column_count: meta.column_count ?? null,
        created_at: meta.created_at ?? null,
        metadata: row.metadata,
      };
    });

    return NextResponse.json({
      chunks: mapped,
      stats,
      pagination,
    });
  } catch (error) {
    console.error('Schema chunks API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Remove a synced schema snapshot (`table_schemas` row) for the caller's organization.
 * When no other snapshot remains for the same logical database name, **table_overview**
 * and **column** `schema_chunks` for that org + database are deleted, and
 * `schema_sync_state` is cleared. **gold_sql** and **glossary** chunks are never deleted.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tableSchemaId =
      typeof body === 'object' && body !== null && 'table_schema_id' in body
        ? (body as { table_schema_id?: unknown }).table_schema_id
        : undefined;

    if (typeof tableSchemaId !== 'string' || !tableSchemaId.trim()) {
      return NextResponse.json({ error: 'table_schema_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const deletionAdmin = createSupabaseSchemaSnapshotDeletionAdmin(admin);
    const outcome = await removeTableSchemaSnapshot(deletionAdmin, tableSchemaId, orgId, {
      onSyncStateDeleteError: (message) => {
        console.error('Error deleting schema_sync_state:', message);
      },
    });

    if (outcome.kind === 'error') {
      return NextResponse.json({ error: outcome.message }, { status: outcome.status });
    }

    return NextResponse.json({
      success: true,
      removed_embeddings: outcome.removed_embeddings,
      ...(outcome.warning ? { warning: outcome.warning } : {}),
    });
  } catch (error) {
    console.error('Schema chunks DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
