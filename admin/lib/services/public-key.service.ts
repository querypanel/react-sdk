import { generateKeyPairSync } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

type PublicKeyRow = Database['public']['Tables']['public_keys']['Row'];
type KeyType = 'rsa' | 'ec' | 'ed25519';

interface CreateStoredPublicKeyInput {
  organizationId: string;
  name: string;
  publicKey: string;
  privateKey?: string | null;
  description?: string | null;
  keyType: KeyType;
}

function toSecretSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'key';
}

async function storePrivateKeyInVault(
  privateKey: string,
  name: string,
  description?: string | null,
  organizationId?: string
): Promise<string> {
  const admin = createAdminClient();
  const baseName = `jwks-${toSecretSlug(name)}`;
  const uniqueName = organizationId ? `${baseName}-${organizationId}` : baseName;
  const { data, error } = await admin.rpc('create_secret', {
    secret: privateKey,
    name: uniqueName,
    description: description ?? `Private key for ${name}`,
  });

  if (error) {
    console.error('Failed to store private key in vault:', error);
    throw new Error('Failed to store private key securely');
  }

  return data as string;
}

export async function createStoredPublicKey(
  supabase: SupabaseClient<Database>,
  input: CreateStoredPublicKeyInput
): Promise<PublicKeyRow> {
  const privateKeySecretId = input.privateKey
    ? await storePrivateKeyInVault(input.privateKey, input.name, input.description, input.organizationId)
    : null;

  const { data, error } = await supabase
    .from('public_keys')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      public_key: input.publicKey,
      private_key_secret_id: privateKeySecretId,
      description: input.description ?? null,
      key_type: input.keyType,
      key_format: 'PEM',
      is_active: true,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to store public key:', error);
    throw new Error('Failed to upload public key');
  }

  return data;
}

export function generateRsaKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    publicKey,
    privateKey,
    keyType: 'rsa' as const,
  };
}

export async function provisionDefaultWorkspaceKey(
  supabase: SupabaseClient<Database>,
  organizationId: string
): Promise<PublicKeyRow> {
  const { publicKey, privateKey, keyType } = generateRsaKeyPair();

  return createStoredPublicKey(supabase, {
    organizationId,
    name: 'Default SDK Key',
    publicKey,
    privateKey,
    description: 'Default signing key created automatically for this workspace',
    keyType,
  });
}
