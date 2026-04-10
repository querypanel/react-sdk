import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import {
  buildGoogleAuthorizationUrl,
  buildGoogleBigQueryOAuthState,
} from '@/lib/oauth/google-bigquery';

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
      .select('id, dialect, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (error || !datasource) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }
    if (datasource.dialect !== 'bigquery') {
      return NextResponse.json({ error: 'Datasource is not BigQuery' }, { status: 400 });
    }

    const state = buildGoogleBigQueryOAuthState({
      datasourceId: id,
      organizationId: orgId,
      userId: user.id,
    });
    const authorizationUrl = buildGoogleAuthorizationUrl(state);

    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    console.error('POST /api/datasources/:id/oauth/bigquery/start exception:', err);
    const message = err instanceof Error ? err.message : 'Failed to start Google OAuth';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
