import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import {
  getDatasourcePassword,
  resolveBigQueryDatasourceConfig,
  testDatasourceConnection,
} from '@/lib/services/datasource.service';
import { isGoogleInvalidRaptError } from '@/lib/oauth/google-bigquery';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const password = await getDatasourcePassword(data);
    const bigQueryConfig =
      data.dialect === 'bigquery' ? await resolveBigQueryDatasourceConfig(data) : null;
    
    // Debug logging
    console.log('Testing connection with:', {
      host: data.host,
      port: data.port,
      database: data.database_name,
      username: data.username,
      ssl_mode: data.ssl_mode,
      use_iam_auth: data.use_iam_auth,
      password_length: password?.length || 0,
      password_secret_id: data.password_secret_id,
      credentials_secret_id: data.credentials_secret_id,
    });
    
    if (data.dialect === 'bigquery' && bigQueryConfig) {
      await testDatasourceConnection({
        dialect: 'bigquery',
        database_name: bigQueryConfig.dataset,
        bigquery_project_id: bigQueryConfig.projectId,
        bigquery_dataset_project_id: bigQueryConfig.datasetProjectId,
        bigquery_location: bigQueryConfig.location,
        bigquery_auth_mode: bigQueryConfig.authMode,
        bigquery_oauth_refresh_token: bigQueryConfig.oauth?.refreshToken,
      });
    } else {
      await testDatasourceConnection({
        dialect: data.dialect,
        host: data.host ?? '',
        port: data.port ?? 0,
        database_name: data.database_name,
        username: data.username ?? '',
        password,
        ssl_mode: data.ssl_mode,
        use_iam_auth: data.use_iam_auth,
        aws_region: data.aws_region,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (isGoogleInvalidRaptError(err)) {
      console.error('BIGQUERY_GOOGLE_OAUTH_INVALID_RAPT', {
        route: 'POST /api/datasources/:id/test',
      });
      return NextResponse.json(
        {
          error: 'Google requires re-authentication for this BigQuery OAuth connection.',
          hint: 'Reconnect Google OAuth for this datasource.',
          code: 'BIGQUERY_GOOGLE_OAUTH_REAUTH_REQUIRED',
        },
        { status: 400 }
      );
    }
    console.error('POST /api/datasources/:id/test exception:', err);
    const message = err instanceof Error ? err.message : 'Connection test failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
