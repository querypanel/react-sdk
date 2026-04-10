import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ database: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { database } = await params;

    if (!database) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 });
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
    
    // Fetch all schemas for the organization
    const { data: schemaData, error: schemaError } = await admin
      .from('table_schemas')
      .select('schema')
      .eq('organization_id', orgId);

    if (schemaError || !schemaData) {
      console.error('Failed to fetch schemas:', schemaError);
      return NextResponse.json({ error: 'Failed to fetch schemas' }, { status: 500 });
    }

    // Find the schema that matches the requested database
    let matchingSchema: Record<string, unknown> | null = null;
    for (const row of schemaData) {
      const schemaObj = row.schema as Record<string, unknown> | null;
      const databaseName = schemaObj?.database as string;
      if (databaseName === database) {
        matchingSchema = schemaObj;
        break;
      }
    }

    if (!matchingSchema) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 });
    }

    // Extract table names from the schema
    let tables: string[] = [];
    if (Array.isArray(matchingSchema.tables)) {
      tables = (matchingSchema.tables as Array<unknown>).map((t: unknown) => {
        // Handle different possible structures
        if (typeof t === 'string') {
          return t;
        }
        // Try common property names for table objects
        if (t && typeof t === 'object') {
          const tableObj = t as Record<string, unknown>;
          return tableObj.name || tableObj.table_name || tableObj.tableName || null;
        }
        return null;
      }).filter((name): name is string => name !== null && typeof name === 'string');
    }

    // Log the schema structure for debugging
    console.log('Database:', database);
    console.log('Matching schema tables:', matchingSchema.tables);
    console.log('Extracted table names:', tables);

    return NextResponse.json({ tables });
  } catch (err) {
    console.error('GET /api/databases/[database]/tables exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
