import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const orgId = request.headers.get('x-organization-id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(searchParams.get('limit') || '10', 10);
    const status = searchParams.get('status');

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('dashboards')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId);

    if (status) {
      query = query.eq('status', status);
    }

    // Get count
    const { count, error: countError } = await query;

    if (countError) {
      console.error('Failed to count dashboards:', countError);
      return NextResponse.json(
        { error: 'Failed to count dashboards' },
        { status: 500 }
      );
    }

    // Apply sorting and pagination
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Failed to fetch dashboards:', error);
      return NextResponse.json(
        { error: 'Failed to fetch dashboards' },
        { status: 500 }
      );
    }

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    });
  } catch (error) {
    console.error('Dashboards GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const orgId = request.headers.get('x-organization-id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, description, content_json, admin_prompt, datasource_id, editor_type, dashboard_type } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const resolvedDashboardType =
      dashboard_type === 'internal' || dashboard_type === 'customer'
        ? dashboard_type
        : 'customer';

    const insertPayload = {
      organization_id: orgId,
      name: name.trim(),
      description: description || null,
      content_json: content_json || admin_prompt || null, // Support both new and old field names
      datasource_id: datasource_id || null,
      editor_type: editor_type || 'blocknote',
      status: 'draft' as const,
      version: 1,
      dashboard_type: resolvedDashboardType,
      created_by: user?.id || null,
    };

    const { data, error } = await supabase
      .from('dashboards')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create dashboard:', error);
      return NextResponse.json(
        { error: 'Failed to create dashboard' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Dashboards POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
