import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

// GET: list databases for caller's organization
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

    const admin = createAdminClient();
    // Fetch from table_schemas instead of databases_v4
    const { data, error } = await admin
      .from('table_schemas')
      .select('id, schema, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/databases error:', error);
      return NextResponse.json({ error: 'Failed to load databases' }, { status: 500 });
    }

    const databases = data?.map((item) => {
      // safely cast schema to any or unknown to access properties
      // assuming schema follows the structure: { database: string, dialect: string, ... }
      const schemaObj = item.schema as Record<string, unknown> | null;
      return {
        id: item.id,
        database_name: (schemaObj?.database as string) || 'Unknown',
        dialect: (schemaObj?.dialect as string) || 'Unknown',
        table_count: Array.isArray(schemaObj?.tables) ? schemaObj.tables.length : 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    }) || [];

    return NextResponse.json({ databases });
  } catch (err) {
    console.error('GET /api/databases exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: update database description (scoped to caller's org)
export async function PATCH(request: NextRequest) {
  // NOTE: This might need updates if table_schemas supports description updates or if we switch back to databases_v4 for metadata
  // For now, leaving as is but it might fail if IDs don't match databases_v4
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, description } = await request.json();
    if (!id || typeof description !== 'string') {
      return NextResponse.json({ error: 'id and description are required' }, { status: 400 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    const admin = createAdminClient();
    // Ensure we only update inside caller's org
    const { error } = await admin
      .from('databases_v4')
      .update({ description })
      .eq('id', id)
      .eq('organization_id', orgId);

    if (error) {
      console.error('PATCH /api/databases error:', error);
      return NextResponse.json({ error: 'Failed to update description' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/databases exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
