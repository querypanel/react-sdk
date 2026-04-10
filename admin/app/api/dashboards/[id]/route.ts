import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function normalizeTenantFieldByDatasource(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k === 'string' && typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

export async function GET(
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

    const { data: dashboard, error: dashboardError } = await supabase
      .from('dashboards')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (dashboardError || !dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('Dashboard GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const {
      name,
      description,
      content_json,
      admin_prompt,
      datasource_id,
      widget_config,
      dashboard_type,
      status,
      deployed_at,
      available_datasource_ids,
      tenant_field_name,
      tenant_field_by_datasource,
    } = body;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name.trim();
    if (description !== undefined) updatePayload.description = description;
    // Support both old (admin_prompt) and new (content_json) field names for backwards compatibility
    if (content_json !== undefined) updatePayload.content_json = content_json;
    if (admin_prompt !== undefined) updatePayload.content_json = admin_prompt;
    if (widget_config !== undefined) updatePayload.widget_config = widget_config;
    if (datasource_id !== undefined) updatePayload.datasource_id = datasource_id;
    if (available_datasource_ids !== undefined) updatePayload.available_datasource_ids = Array.isArray(available_datasource_ids) ? available_datasource_ids : null;
    if (tenant_field_name !== undefined) updatePayload.tenant_field_name = typeof tenant_field_name === 'string' ? tenant_field_name.trim() || null : null;
    if (tenant_field_by_datasource !== undefined) {
      const normalized = normalizeTenantFieldByDatasource(tenant_field_by_datasource);
      updatePayload.tenant_field_by_datasource = normalized;
    }
    if (dashboard_type !== undefined && (dashboard_type === 'customer' || dashboard_type === 'internal')) {
      updatePayload.dashboard_type = dashboard_type;
    }
    if (status !== undefined) {
      if (status !== 'draft' && status !== 'deployed') {
        return NextResponse.json(
          { error: 'Invalid status. Must be "draft" or "deployed"' },
          { status: 400 }
        );
      }
      updatePayload.status = status;
      if (deployed_at === undefined) {
        updatePayload.deployed_at = status === 'deployed' ? new Date().toISOString() : null;
      }
    }
    if (deployed_at !== undefined) {
      updatePayload.deployed_at = deployed_at;
    }

    const { data, error } = await supabase
      .from('dashboards')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to update dashboard:', error);
      return NextResponse.json(
        { error: 'Failed to update dashboard' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Dashboard PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from('dashboards')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (error) {
      console.error('Failed to delete dashboard:', error);
      return NextResponse.json(
        { error: 'Failed to delete dashboard' },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Dashboard DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
