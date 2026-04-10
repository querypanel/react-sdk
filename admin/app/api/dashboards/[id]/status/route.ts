import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const orgId = request.headers.get('x-organization-id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['draft', 'deployed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "draft" or "deployed"' },
        { status: 400 }
      );
    }

    const updatePayload: {
      status: string;
      updated_at: string;
      deployed_at: string | null;
    } = {
      status,
      updated_at: new Date().toISOString(),
      deployed_at: status === 'deployed' ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from('dashboards')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to update dashboard status:', error);
      return NextResponse.json(
        { error: 'Failed to update dashboard status' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Dashboard status PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
