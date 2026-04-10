import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { provisionDefaultWorkspaceKey } from '@/lib/services/public-key.service';

type OrganizationApiRow = {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string | null;
  plan_id: number | null;
};

type OrganizationWithRole = OrganizationApiRow & { role: 'owner' | 'admin' | 'member' };

// GET /api/organizations -> returns all organizations the current user can access (owned or member)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Active memberships
    const { data: memberRows, error: memberErr } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('joined_at', 'is', null);

    if (memberErr) {
      console.error('GET /api/organizations membership lookup error', memberErr);
      return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
    }

    const membershipOrgIds = (memberRows ?? [])
      .map((r) => r.organization_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Owned orgs
    const { data: ownedOrgs, error: ownedErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id);

    if (ownedErr) {
      console.error('GET /api/organizations owned orgs lookup error', ownedErr);
      return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
    }

    const ownedOrgIds = (ownedOrgs ?? [])
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const allOrgIds = Array.from(new Set([...membershipOrgIds, ...ownedOrgIds]));
    if (allOrgIds.length === 0) {
      return NextResponse.json({ organizations: [] satisfies OrganizationWithRole[] });
    }

    const { data: orgRows, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, owner_id, created_at, plan_id')
      .in('id', allOrgIds);

    if (orgError) {
      console.error('GET /api/organizations org load error', orgError);
      return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
    }

    const membershipRoleByOrgId = new Map<string, 'admin' | 'member' | 'owner'>();
    for (const row of memberRows ?? []) {
      const orgId = row.organization_id;
      if (!orgId) continue;
      const role = row.role === 'admin' || row.role === 'owner' ? row.role : 'member';
      membershipRoleByOrgId.set(orgId, role);
    }

    const organizations: OrganizationWithRole[] = (orgRows ?? []).map((org) => {
      const typedOrg = org as OrganizationApiRow;
      const role: OrganizationWithRole['role'] =
        typedOrg.owner_id === user.id ? 'owner' : (membershipRoleByOrgId.get(typedOrg.id) ?? 'member');
      return { ...typedOrg, role };
    });

    return NextResponse.json({ organizations });
  } catch (err) {
    console.error('GET /api/organizations error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/organizations -> create new organization for current user and set membership
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Enforce org creation limit (max 5 accessible orgs: owned + active memberships)
    const MAX_ORGANIZATIONS_PER_USER = 5;
    const [{ data: memberOrgs, error: memberErr }, { data: ownedOrgs, error: ownedErr }] = await Promise.all([
      supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .not('joined_at', 'is', null),
      supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id),
    ]);

    if (memberErr || ownedErr) {
      console.error('Failed to check organization limit', { memberErr, ownedErr });
      return NextResponse.json({ error: 'Failed to validate organization limit' }, { status: 500 });
    }

    const orgIds = new Set<string>();
    for (const row of memberOrgs ?? []) {
      if (row.organization_id) orgIds.add(row.organization_id);
    }
    for (const row of ownedOrgs ?? []) {
      if (row.id) orgIds.add(row.id);
    }

    if (orgIds.size >= MAX_ORGANIZATIONS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_ORGANIZATIONS_PER_USER} organizations allowed` },
        { status: 403 }
      );
    }

    // Create organization
    console.log('Attempting to create org with user.id:', user.id);
    const { data: org, error: createError } = await supabase
      .from('organizations')
      .insert({ name: name.trim(), owner_id: user.id, plan_id: 1 })
      .select('id, name, owner_id, created_at, plan_id')
      .single();

    if (createError || !org) {
      console.error('Create org error', createError);
      console.error('Create org error details:', JSON.stringify(createError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to create organization', 
        details: createError?.message,
        code: createError?.code 
      }, { status: 500 });
    }

    try {
      await provisionDefaultWorkspaceKey(supabase, org.id);
    } catch (keyError) {
      console.error('Default workspace key provisioning error', keyError);

      const { error: rollbackError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', org.id);

      if (rollbackError) {
        console.error('Failed to roll back organization after key provisioning failure', rollbackError);
      }

      return NextResponse.json({ error: 'Failed to provision workspace keys' }, { status: 500 });
    }

    // Add membership for the owner
    const { error: memberInsertError } = await supabase
      .from('organization_members')
      .insert({ 
        organization_id: org.id, 
        user_id: user.id, 
        role: 'owner',
        joined_at: new Date().toISOString()
      });

    if (memberInsertError) {
      console.error('Membership insert error', memberInsertError);
      // best-effort: not fatal for org creation, but surface info
    }

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



