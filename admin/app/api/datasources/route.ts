import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import { buildDatasourceInsert, toDatasourceListItem } from '@/lib/services/datasource.service';

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
    const { data, error } = await admin
      .from('datasources')
      .select('id, organization_id, name, dialect, host, port, database_name, username, password_secret_id, credentials_secret_id, ssl_mode, use_iam_auth, aws_region, aws_role_arn, bigquery_project_id, bigquery_dataset_project_id, bigquery_location, bigquery_meta, tenant_field_name, tenant_field_type, created_by, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/datasources error:', error);
      return NextResponse.json({ error: 'Failed to load datasources' }, { status: 500 });
    }

    const datasources = (data ?? []).map((row) => toDatasourceListItem(row));
    return NextResponse.json({ datasources });
  } catch (err) {
    console.error('GET /api/datasources exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!dialect || typeof dialect !== 'string' || !allowedDialects.has(dialect)) {
      return NextResponse.json({ error: 'Invalid dialect' }, { status: 400 });
    }
    if (!database_name || typeof database_name !== 'string') {
      return NextResponse.json({ error: dialect === 'bigquery' ? 'Dataset is required' : 'Database name is required' }, { status: 400 });
    }

    const isBigQuery = dialect === 'bigquery';
    const parsedBigQueryMeta = extractBigQueryMeta(bigquery_meta);
    const authMode = 'google_oauth';
    const parsedPort = port == null || port === '' ? null : (typeof port === 'number' ? port : Number(port));
    const resolvedBigQueryProjectId =
      (typeof bigquery_project_id === 'string' ? bigquery_project_id.trim() : '') ||
      parsedBigQueryMeta?.projectId ||
      '';

    if (isBigQuery) {
      if (!resolvedBigQueryProjectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
      }
      if (!allowedBigQueryAuthModes.has(authMode)) {
        return NextResponse.json({ error: 'Invalid BigQuery auth mode' }, { status: 400 });
      }
      if (bigquery_credentials) {
        return NextResponse.json({ error: 'BigQuery service account JSON auth has been removed. Use Google OAuth.' }, { status: 400 });
      }
    } else {
      if (!host || typeof host !== 'string') {
        return NextResponse.json({ error: 'Host is required' }, { status: 400 });
      }
      if (!Number.isFinite(parsedPort) || (parsedPort ?? 0) <= 0) {
        return NextResponse.json({ error: 'Valid port is required' }, { status: 400 });
      }
      if (!username || typeof username !== 'string') {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
      }
      if (dialect !== 'postgres' && use_iam_auth) {
        return NextResponse.json({ error: 'IAM auth is only supported for Postgres' }, { status: 400 });
      }
      if (!use_iam_auth && (!password || typeof password !== 'string' || password.length === 0)) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }
    }

    const admin = createAdminClient();
    const insertValues = await buildDatasourceInsert(
      {
        name: name.trim(),
        dialect: dialect as 'postgres' | 'clickhouse' | 'bigquery',
        host: isBigQuery ? null : host.trim(),
        port: isBigQuery ? null : parsedPort,
        database_name: database_name.trim(),
        username: isBigQuery ? null : username.trim(),
        password: isBigQuery ? undefined : (password ?? ''),
        bigquery_project_id: isBigQuery ? resolvedBigQueryProjectId : null,
        bigquery_dataset_project_id: isBigQuery && typeof bigquery_dataset_project_id === 'string' ? bigquery_dataset_project_id.trim() || null : null,
        bigquery_location: isBigQuery && typeof bigquery_location === 'string' ? bigquery_location.trim() || null : null,
        bigquery_meta: isBigQuery
          ? {
              ...(typeof bigquery_meta === 'object' && bigquery_meta !== null ? bigquery_meta as Record<string, unknown> : {}),
              authMode,
              projectId: resolvedBigQueryProjectId || undefined,
            }
          : null,
        ssl_mode: isBigQuery ? null : ssl_mode,
        use_iam_auth: isBigQuery ? false : Boolean(use_iam_auth),
        aws_region: isBigQuery ? null : (aws_region ?? null),
        aws_role_arn: isBigQuery ? null : (aws_role_arn ?? null),
        tenant_field_name: typeof tenant_field_name === 'string' ? tenant_field_name.trim() || null : null,
        tenant_field_type: typeof tenant_field_type === 'string' ? tenant_field_type : 'String',
      },
      orgId,
      user.id
    );

    const { data, error } = await admin
      .from('datasources')
      .insert(insertValues)
      .select('id, organization_id, name, dialect, host, port, database_name, username, password_secret_id, credentials_secret_id, ssl_mode, use_iam_auth, aws_region, aws_role_arn, bigquery_project_id, bigquery_dataset_project_id, bigquery_location, bigquery_meta, tenant_field_name, tenant_field_type, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('POST /api/datasources error:', error);
      return NextResponse.json({ error: 'Failed to create datasource' }, { status: 500 });
    }

    return NextResponse.json({ datasource: toDatasourceListItem(data) }, { status: 201 });
  } catch (err) {
    console.error('POST /api/datasources exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
