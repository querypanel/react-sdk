import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

// GET: list members of the caller's organization
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolved = await resolveOrganizationIdForRequest(req, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) return NextResponse.json({ members: [] });

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .single();
    if (!membership) return NextResponse.json({ members: [] });

    const { data: members, error, count } = await supabase
      .from('organization_members')
      .select('user_id, role, joined_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('joined_at', { ascending: true });
    if (error) {
      console.error('GET /api/organizations/members error', error);
      return NextResponse.json({ error: 'Failed to load members' }, { status: 500 });
    }

    // Load plan features for collaborator limit
    const { data: organization } = await supabase
      .from('organizations')
      .select('plans(features)')
      .eq('id', orgId)
      .maybeSingle();
    // plans can be an array or object depending on join shape
    const planObj = Array.isArray(organization?.plans) ? organization?.plans?.[0] : organization?.plans;
    const collaboratorsLimit = +planObj?.features?.collaborators || 1;

    // enrich with emails via admin API
    const admin = createAdminClient();
    const enriched = await Promise.all((members || []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      return { ...m, email: data?.user?.email ?? null };
    }));

    return NextResponse.json({ members: enriched, currentRole: membership.role, collaboratorsLimit, membersCount: count ?? enriched.length });
  } catch (err) {
    console.error('GET /api/organizations/members error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: add member by email (role default member)
export async function POST(req: NextRequest) {
  try {
    const { email, role } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolved = await resolveOrganizationIdForRequest(req, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    // caller org
    const { data: membership, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .single();
    if (memErr || !membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    // require admin/owner (RLS will also enforce this)
    if (!['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Enforce collaborators limit based on plan
    const { data: orgPlan } = await supabase
      .from('organizations')
      .select('plans(features)')
      .eq('id', orgId)
      .maybeSingle();
    const planData = Array.isArray(orgPlan?.plans) ? orgPlan?.plans?.[0] : orgPlan?.plans;
    const limit = +planData?.features?.collaborators || 1;
    const { count: memberCount } = await supabase
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if ((memberCount ?? 0) >= limit) {
      return NextResponse.json({ error: 'Collaborator limit reached for your plan. Upgrade to add more.' }, { status: 402 });
    }

    const admin = createAdminClient();
    // Fallback lookup: iterate pages to find by email since getUserByEmail may be unavailable
    let invitedUser: { id: string } | null = null;
    let page = 1;
    const perPage = 200;
    while (page <= 10 && !invitedUser) { // hard cap to avoid excessive pagination
      const list = await admin.auth.admin.listUsers({ page, perPage });
      const users: Array<{ id: string; email?: string | null }> = list.data?.users || [];
      invitedUser = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
      if (users.length < perPage) break;
      page += 1;
    }
    if (!invitedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ensure user not already member of another org
    const { data: existing } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', invitedUser.id)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'User already belongs to an organization' }, { status: 409 });
    }

    const { error: insertErr } = await supabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: invitedUser.id,
        role: role && ['member', 'admin', 'owner'].includes(role) ? role : 'member',
        joined_at: new Date().toISOString(),
      });
    if (insertErr) {
      console.error('Insert member error', insertErr);
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations/members error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



