import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import { buildDatasourceUpdate, toDatasourceListItem } from '@/lib/services/datasource.service';

const allowedDialects = new Set(['postgres', 'clickhouse', 'bigquery']);
const allowedBigQueryAuthModes = new Set(['google_oauth']);

function extractBigQueryMeta(value: unknown): { authMode?: 'google_oauth'; projectId?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const meta = value as Record<string, unknown>;
  const authMode =
    typeof meta.authMode === 'string' && allowedBigQueryAuthModes.has(meta.authMode)
      ? (meta.authMode as 'google_oauth')
      : undefined;
  const projectId = typeof meta.projectId === 'string' ? meta.projectId.trim() : undefined;
  return { authMode, projectId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const { data, error } = await admin
      .from('datasources')
      .select('id, organization_id, name, dialect, host, port, database_name, username, password_secret_id, credentials_secret_id, ssl_mode, use_iam_auth, aws_region, aws_role_arn, bigquery_project_id, bigquery_dataset_project_id, bigquery_location, bigquery_meta, tenant_field_name, tenant_field_type, created_by, created_at, updated_at')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }

    return NextResponse.json({ datasource: toDatasourceListItem(data) });
  } catch (err) {
    console.error('GET /api/datasources/:id exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const body = await request.json();
    const {
      name,
      dialect,
      host,
      port,
      database_name,
      username,
      password,
      bigquery_project_id,
      bigquery_dataset_project_id,
      bigquery_location,
      bigquery_meta,
      bigquery_credentials,
      ssl_mode,
      use_iam_auth,
      aws_region,
      aws_role_arn,
      tenant_field_name,
      tenant_field_type,
    } = body ?? {};

    if (dialect && !allowedDialects.has(dialect)) {
      return NextResponse.json({ error: 'Invalid dialect' }, { status: 400 });
    }
    if (port !== undefined && port !== null && port !== '') {
      const parsedPort = typeof port === 'number' ? port : Number(port);
      if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
        return NextResponse.json({ error: 'Valid port is required' }, { status: 400 });
      }
    }

    // Get current datasource to use name and existing secrets for validation.
    const admin = createAdminClient();
    const { data: currentData } = await admin
      .from('datasources')
      .select('name, dialect, password_secret_id, credentials_secret_id, bigquery_project_id, bigquery_dataset_project_id, bigquery_meta')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    const effectiveDialect = (typeof dialect === 'string' ? dialect : currentData?.dialect) as
      | 'postgres'
      | 'clickhouse'
      | 'bigquery'
      | undefined;

    if (!effectiveDialect || !allowedDialects.has(effectiveDialect)) {
      return NextResponse.json({ error: 'Invalid dialect' }, { status: 400 });
    }

    const isBigQuery = effectiveDialect === 'bigquery';
    const parsedBigQueryMeta = extractBigQueryMeta(bigquery_meta);
    const currentBigQueryMeta = extractBigQueryMeta(currentData?.bigquery_meta);
    const effectiveAuthMode = 'google_oauth';
    const parsedPort = port == null || port === '' ? undefined : (typeof port === 'number' ? port : Number(port));
    const effectiveProjectId =
      (typeof bigquery_project_id === 'string' ? bigquery_project_id.trim() : '') ||
      parsedBigQueryMeta?.projectId ||
      currentBigQueryMeta?.projectId ||
      currentData?.bigquery_project_id?.trim() ||
      '';

    if (isBigQuery) {
      if (!effectiveProjectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
      }
      if (!allowedBigQueryAuthModes.has(effectiveAuthMode)) {
        return NextResponse.json({ error: 'Invalid BigQuery auth mode' }, { status: 400 });
      }
      if (bigquery_credentials) {
        return NextResponse.json({ error: 'BigQuery service account JSON auth has been removed. Use Google OAuth.' }, { status: 400 });
      }
    } else {
      if (typeof host === 'string' && !host.trim()) {
        return NextResponse.json({ error: 'Host is required' }, { status: 400 });
      }
      if (parsedPort !== undefined && (!Number.isFinite(parsedPort) || parsedPort <= 0)) {
        return NextResponse.json({ error: 'Valid port is required' }, { status: 400 });
      }
      if (typeof username === 'string' && !username.trim()) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
      }
      if (effectiveDialect !== 'postgres' && use_iam_auth) {
        return NextResponse.json({ error: 'IAM auth is only supported for Postgres' }, { status: 400 });
      }
      if (
        !Boolean(use_iam_auth) &&
        !currentData?.password_secret_id &&
        (!password || typeof password !== 'string' || password.length === 0)
      ) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }
    }

    const updateValues = await buildDatasourceUpdate({
      name: typeof name === 'string' ? name.trim() : name,
      dialect: effectiveDialect,
      host: typeof host === 'string' ? host.trim() : host,
      port: parsedPort,
      database_name: typeof database_name === 'string' ? database_name.trim() : database_name,
      username: typeof username === 'string' ? username.trim() : username,
      password,
      bigquery_project_id: typeof bigquery_project_id === 'string' ? bigquery_project_id.trim() || null : undefined,
      bigquery_dataset_project_id: typeof bigquery_dataset_project_id === 'string' ? bigquery_dataset_project_id.trim() || null : undefined,
      bigquery_location: typeof bigquery_location === 'string' ? bigquery_location.trim() || null : undefined,
      bigquery_meta:
        effectiveDialect === 'bigquery'
          ? {
              ...(typeof currentData?.bigquery_meta === 'object' && currentData.bigquery_meta !== null ? currentData.bigquery_meta as Record<string, unknown> : {}),
              ...(typeof bigquery_meta === 'object' && bigquery_meta !== null ? bigquery_meta as Record<string, unknown> : {}),
              authMode: effectiveAuthMode,
              projectId: effectiveProjectId || undefined,
            }
          : undefined,
      ssl_mode,
      use_iam_auth,
      aws_region,
      aws_role_arn,
      tenant_field_name: typeof tenant_field_name === 'string' ? tenant_field_name.trim() || null : tenant_field_name,
      tenant_field_type: typeof tenant_field_type === 'string' ? tenant_field_type : tenant_field_type,
      currentName: currentData?.name,
    });

    if (Object.keys(updateValues).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('datasources')
      .update(updateValues)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('id, organization_id, name, dialect, host, port, database_name, username, password_secret_id, credentials_secret_id, ssl_mode, use_iam_auth, aws_region, aws_role_arn, bigquery_project_id, bigquery_dataset_project_id, bigquery_location, bigquery_meta, tenant_field_name, tenant_field_type, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('PUT /api/datasources/:id error:', error);
      return NextResponse.json({ error: 'Failed to update datasource' }, { status: 500 });
    }

    return NextResponse.json({ datasource: toDatasourceListItem(data) });
  } catch (err) {
    console.error('PUT /api/datasources/:id exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const { error } = await admin
      .from('datasources')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (error) {
      console.error('DELETE /api/datasources/:id error:', error);
      return NextResponse.json({ error: 'Failed to delete datasource' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/datasources/:id exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
