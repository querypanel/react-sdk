import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrganizationIdForRequest } from '@/lib/supabase/organization';
import { createStoredPublicKey } from '@/lib/services/public-key.service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, public_key, private_key, description, key_type } = await request.json();

    if (!name || !public_key || !key_type) {
      return NextResponse.json({ error: 'Name, public key, and key type are required' }, { status: 400 });
    }

    // Validate key type
    const validTypes = ['rsa', 'ec', 'ed25519'];
    if (!validTypes.includes(key_type)) {
      return NextResponse.json({ error: 'Invalid key type' }, { status: 400 });
    }

    // Basic PEM format validation
    if (!public_key.includes('-----BEGIN') || !public_key.includes('-----END')) {
      return NextResponse.json({ error: 'Invalid PEM format' }, { status: 400 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === 'explicit' ? 'Forbidden' : 'No organization found for user' },
        { status: resolved.source === 'explicit' ? 403 : 404 }
      );
    }

    const data = await createStoredPublicKey(supabase, {
      organizationId: orgId,
      name,
      publicKey: public_key,
      privateKey: private_key || null,
      description: description || null,
      keyType: key_type,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Public key upload error:', error);
    return NextResponse.json({ error: 'Failed to upload public key' }, { status: 500 });
  }
}
