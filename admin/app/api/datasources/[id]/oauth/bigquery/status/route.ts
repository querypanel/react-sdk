import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

type BigQueryMeta = {
  authMode?: 'google_oauth';
  oauth?: {
    refreshTokenSecretId?: string;
    expiresAt?: string;
    subjectEmail?: string;
    scopes?: string[];
  };
};

function normalizeBigQueryMeta(value: unknown): BigQueryMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as BigQueryMeta;
}

export async function GET(
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

    const meta = normalizeBigQueryMeta(datasource.bigquery_meta);
    const authMode = 'google_oauth';
    const expiresAt = meta.oauth?.expiresAt;
    const isExpired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const connected =
      authMode === 'google_oauth' && Boolean(meta.oauth?.refreshTokenSecretId);

    return NextResponse.json({
      authMode,
      connected,
      expired: connected ? isExpired : false,
      subjectEmail: meta.oauth?.subjectEmail ?? null,
      scopes: meta.oauth?.scopes ?? [],
      expiresAt: expiresAt ?? null,
    });
  } catch (err) {
    console.error('GET /api/datasources/:id/oauth/bigquery/status exception:', err);
    return NextResponse.json({ error: 'Failed to load BigQuery OAuth status' }, { status: 500 });
  }
}
