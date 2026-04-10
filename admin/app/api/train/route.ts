import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getQueryPanelSdkBaseUrl,
  getQueryPanelServiceApiKey,
  getVercelProtectionBypassHeaders,
} from '@/lib/querypanel-sdk/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
// no admin client; training goes through external /ingest API

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      training_type,
      table_name,
      database,
      dialect,
      // Gold SQL fields
      sql,
      name,
      description,
      // Glossary fields
      term,
      definition,
    } = await request.json();

    // Validate common required fields
    if (!training_type || !table_name || !database) {
      return NextResponse.json({ error: 'Missing required fields: training_type, table_name, database' }, { status: 400 });
    }

    // Validate training type
    const validTypes = ['glossary', 'gold_sql'];
    if (!validTypes.includes(training_type)) {
      return NextResponse.json({ error: 'Invalid training type. Must be gold_sql or glossary' }, { status: 400 });
    }

    // Validate type-specific fields
    if (training_type === 'gold_sql' && !sql) {
      return NextResponse.json({ error: 'SQL is required for gold_sql type' }, { status: 400 });
    }

    if (training_type === 'glossary' && (!term || !definition)) {
      return NextResponse.json({ error: 'Term and definition are required for glossary type' }, { status: 400 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found for user' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    // Call external /ingest API
    const apiUrl = getQueryPanelSdkBaseUrl();
    const apiKey = getQueryPanelServiceApiKey();
    if (!apiUrl || !apiKey) {
      console.error('Missing querypanel-sdk base URL or SERVICE_API_KEY');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Build the payload based on training type
    const tablePayload: {
      table_name: string;
      gold_sql?: Array<{ sql: string; name?: string; description?: string }>;
      glossary?: Array<{ term: string; definition: string }>;
    } = {
      table_name,
    };

    if (training_type === 'gold_sql') {
      tablePayload.gold_sql = [{
        sql,
        ...(name && { name }),
        ...(description && { description }),
      }];
    } else if (training_type === 'glossary') {
      tablePayload.glossary = [{
        term,
        definition,
      }];
    }

    const payload = {
      organization_id: orgId,
      tenant_id: orgId,
      database,
      dialect: dialect || 'postgres',
      tables: [tablePayload],
    };

    console.log('Sending to SQL_AGENT_URL:', JSON.stringify(payload, null, 2));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...getVercelProtectionBypassHeaders(),
    };

    const response = await fetch(`${apiUrl}/knowledge-base/chunks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('knowledge-base/chunks endpoint error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return NextResponse.json(
        { error: 'Failed to process training data', details: errorData },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('Success response:', result);

    return NextResponse.json({
      success: true,
      training: { processed: { [training_type]: 1 } },
      data: result,
    });
  } catch (error) {
    console.error('Training error:', error);
    return NextResponse.json({ error: 'Failed to process training' }, { status: 500 });
  }
}
