import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

type BigQueryMeta = {
  authMode?: 'google_oauth';
  projectId?: string;
  datasetProjectId?: string;
  location?: string;
  credentialsSecretId?: string;
  oauth?: {
    refreshTokenSecretId?: string;
    accessTokenSecretId?: string;
    expiresAt?: string;
    subjectEmail?: string;
    scopes?: string[];
    tokenUri?: string;
  };
};

function normalizeBigQueryMeta(value: unknown): BigQueryMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as BigQueryMeta;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
    const { data: datasource, error } = await admin
      .from('datasources')
      .select('id, dialect, organization_id, bigquery_meta')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();
    if (error || !datasource) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }
    if (datasource.dialect !== 'bigquery') {
      return NextResponse.json({ error: 'Datasource is not BigQuery' }, { status: 400 });
    }

    const currentMeta = normalizeBigQueryMeta(datasource.bigquery_meta);
    const nextMeta: BigQueryMeta = {
      ...currentMeta,
      authMode: 'google_oauth',
      oauth: {},
    };

    const { error: updateError } = await admin
      .from('datasources')
      .update({
        bigquery_meta: nextMeta,
      })
      .eq('id', id)
      .eq('organization_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to disconnect Google OAuth' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/datasources/:id/oauth/bigquery/disconnect exception:', err);
    return NextResponse.json({ error: 'Failed to disconnect Google OAuth' }, { status: 500 });
  }
}
