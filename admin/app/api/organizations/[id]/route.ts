import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function assertOrgAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, orgId: string) {
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase.from('organizations').select('id').eq('id', orgId).eq('owner_id', userId).limit(1),
    supabase.from('organization_members').select('organization_id').eq('organization_id', orgId).eq('user_id', userId).not('joined_at', 'is', null).limit(1)
  ]);
  return Boolean(owned?.[0]?.id || member?.[0]?.organization_id);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const hasAccess = await assertOrgAccess(supabase, user.id, id);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('id, name, owner_id, created_at, plan_id')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ organization });
  } catch (err) {
    console.error('GET /api/organizations/[id] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const hasAccess = await assertOrgAccess(supabase, user.id, id);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates' }, { status: 400 });
    }

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select('id, name, owner_id, created_at, plan_id')
      .single();
    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    return NextResponse.json({ organization });
  } catch (err) {
    console.error('PATCH /api/organizations/[id] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const hasAccess = await assertOrgAccess(supabase, user.id, id);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await supabase.from('organizations').delete().eq('id', id);
    if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/organizations/[id] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



