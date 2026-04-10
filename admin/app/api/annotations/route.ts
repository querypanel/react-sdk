import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getQueryPanelSdkBaseUrl,
  getQueryPanelServiceApiKey,
  getVercelProtectionBypassHeaders,
} from '@/lib/querypanel-sdk/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    console.log({ body });
    const { target_identifier, content } = body;

    // Validate required fields
    if (!target_identifier || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found for user' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    const apiUrl = getQueryPanelSdkBaseUrl();
    const apiKey = getQueryPanelServiceApiKey();
    if (!apiUrl || !apiKey) {
      console.error('Missing querypanel-sdk base URL or SERVICE_API_KEY');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Build annotation payload
    const annotationPayload = {
      organization_id: orgId,
      target_identifier,
      content,
      user_id: user.id,
    };

    // Send POST request to SQL_AGENT_URL
    const fullUrl = `${apiUrl}/knowledge-base/annotations`;
    console.log('Calling SQL_AGENT_URL:', fullUrl);
    console.log('Payload:', JSON.stringify(annotationPayload, null, 2));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...getVercelProtectionBypassHeaders(),
    };

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(annotationPayload),
    });

    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      const responseText = await response.text();
      console.error('Annotation endpoint error:', {
        status: response.status,
        statusText: response.statusText,
        url: fullUrl,
        responseBody: responseText,
      });

      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText || 'Unknown error' };
      }

      return NextResponse.json(
        {
          error: `Failed to create annotation (${response.status} ${response.statusText})`,
          details: errorData,
          endpoint: fullUrl
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Annotation error:', error);
    return NextResponse.json({ error: 'Failed to create annotation' }, { status: 500 });
  }
}
