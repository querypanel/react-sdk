import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
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
    const { is_active } = await request.json();

    // Ensure belongs to accessible org
    const { data: keyRow, error: fetchError } = await supabase
      .from('public_keys')
      .select('id, organization_id')
      .eq('id', keyId)
      .single();

    if (fetchError || !keyRow) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

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

    const { data, error } = await supabase
      .from('public_keys')
      .update({ 
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update key status' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Key status update error:', error);
    return NextResponse.json({ error: 'Failed to update key status' }, { status: 500 });
  }
}
