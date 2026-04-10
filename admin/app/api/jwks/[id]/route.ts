import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: keyId } = await params;

    // Ensure the key belongs to an organization the user can access
    const { data: keyRow, error: fetchError } = await supabase
      .from('public_keys')
      .select('id, organization_id')
      .eq('id', keyId)
      .single();

    if (fetchError || !keyRow) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    // Validate membership or ownership
    const { data: orgAccess } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', keyRow.organization_id)
      .not('joined_at', 'is', null);

    const { data: isOwner } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .eq('id', keyRow.organization_id);

    if (!orgAccess?.length && !isOwner?.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('public_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to delete public key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Public key deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete public key' }, { status: 500 });
  }
}
