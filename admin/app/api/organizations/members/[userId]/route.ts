import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

// PATCH: change role for a user in caller's org
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { role } = await req.json();
    if (!['member','admin','owner'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolved = await resolveOrganizationIdForRequest(req, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    // caller org and role
    const { data: caller, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .single();
    if (memErr || !caller) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    // Only admins or owners can remove members
    if (!['admin','owner'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only admins or owners can change roles
    if (!['admin','owner'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // permissions: only owner can set owner; admin/owner can set member/admin
    const { userId: targetUserId } = await params;
    if (role === 'owner' && caller.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can assign owner' }, { status: 403 });
    }

    // fetch target role for checks
    if (role !== 'owner') {
      const { data: target } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', targetUserId)
        .limit(1)
        .single();
      // Admins cannot change owners
      if (caller.role === 'admin' && target?.role === 'owner') {
        return NextResponse.json({ error: 'Admins cannot modify owner role' }, { status: 403 });
      }
      if (target?.role === 'owner') {
        const { count } = await supabase
          .from('organization_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('role', 'owner');
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last owner' }, { status: 400 });
        }
      }
    }

    const { error: updErr } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId);
    if (updErr) return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/organizations/members/[userId] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: remove a user from caller's org
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolved = await resolveOrganizationIdForRequest(req, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const { data: caller, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .single();
    if (memErr || !caller) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const { userId: targetUserId } = await params;
    // prevent removing last owner
    const { data: target } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .limit(1)
      .single();
    if (target?.role === 'owner') {
      // Admins cannot remove owners
      if (caller.role === 'admin') {
        return NextResponse.json({ error: 'Admins cannot remove owners' }, { status: 403 });
      }
      const { count } = await supabase
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('role', 'owner');
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 });
      }
    }

    // Admins can only remove members
    if (caller.role === 'admin' && target?.role !== 'member') {
      return NextResponse.json({ error: 'Admins can only remove members' }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId);
    if (delErr) return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/organizations/members/[userId] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



