import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing chunk id' }, { status: 400 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found for user' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    // Fetch the chunk (v4) using service role to bypass RLS
    const admin = createAdminClient();
    const { data: chunk, error: fetchError } = await admin
      .from('schema_chunks')
      .select('id, metadata')
      .eq('id', id)
      .single();

    if (fetchError || !chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
    }

    // Verify ownership via metadata.organization_id
    type V4Metadata = { organization_id?: string; chunk_type?: string; type?: string };
    const metadata: V4Metadata = ((chunk as { metadata?: V4Metadata } | null)?.metadata) ?? {};
    const chunkOrgId = metadata.organization_id ?? null;
    if (!chunkOrgId || chunkOrgId !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow deleting gold_sql and glossary chunks
    // Check both 'type' and 'chunk_type' fields as different parts of the system may use either
    const chunkType = metadata.type ?? metadata.chunk_type ?? '';
    const allowedTypes = ['gold_sql', 'glossary'];
    if (!allowedTypes.includes(chunkType)) {
      return NextResponse.json({ error: 'Only gold_sql and glossary chunks can be deleted via this endpoint' }, { status: 400 });
    }

    const { error: deleteError } = await admin
      .from('schema_chunks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete chunk:', deleteError);
      return NextResponse.json({ error: 'Failed to delete chunk' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Chunk delete error:', err);
    return NextResponse.json({ error: 'Failed to delete chunk' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing chunk id' }, { status: 400 });
    }

    const body = await request.json();
    const { term, definition, question, sql, name, description } = body;

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found for user' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    // Fetch the chunk using service role to bypass RLS
    const admin = createAdminClient();
    const { data: chunk, error: fetchError } = await admin
      .from('schema_chunks')
      .select('id, content, metadata')
      .eq('id', id)
      .single();

    if (fetchError || !chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
    }

    // Verify ownership via metadata.organization_id
    type V4Metadata = { 
      organization_id?: string; 
      chunk_type?: string;
      type?: string;
      database?: string;
      dialect?: string;
      table?: string;
      term?: string;
      entry_name?: string | null;
      sql?: string | null;
      source?: string;
      target_identifier?: string;
    };
    const metadata: V4Metadata = ((chunk as { metadata?: V4Metadata } | null)?.metadata) ?? {};
    const chunkOrgId = metadata.organization_id ?? null;
    if (!chunkOrgId || chunkOrgId !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const chunkType = metadata.chunk_type ?? metadata.type ?? '';

    // Only allow editing gold_sql and glossary chunks
    const allowedTypes = ['gold_sql', 'glossary'];
    if (!allowedTypes.includes(chunkType)) {
      return NextResponse.json({ error: 'Only gold_sql and glossary chunks can be edited via this endpoint' }, { status: 400 });
    }

    // Build updated content based on chunk type
    let updatedContent = '';
    const updatedMetadata = { ...metadata };

    if (chunkType === 'glossary') {
      if (!term || !definition) {
        return NextResponse.json({ error: 'Term and definition are required for glossary entries' }, { status: 400 });
      }
      updatedContent = `Term: ${term}\nDefinition: ${definition}`;
      updatedMetadata.term = term;
    } else if (chunkType === 'gold_sql') {
      if (!sql) {
        return NextResponse.json({ error: 'SQL is required for gold_sql entries' }, { status: 400 });
      }
      const title = name || question || `Gold SQL for ${metadata.table || ''}`;
      const desc = description ? `Description: ${description}\n` : '';
      updatedContent = `${title}\n${desc}SQL:\n${sql}`;
      updatedMetadata.entry_name = name || null;
      updatedMetadata.sql = sql;
    }

    // Update the chunk in database
    const { error: updateError } = await admin
      .from('schema_chunks')
      .update({
        content: updatedContent,
        metadata: updatedMetadata,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update chunk:', updateError);
      return NextResponse.json({ error: 'Failed to update chunk' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Chunk update error:', err);
    return NextResponse.json({ error: 'Failed to update chunk' }, { status: 500 });
  }
}


