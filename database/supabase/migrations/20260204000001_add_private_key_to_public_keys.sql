-- Add private_key_secret_id to public_keys table for node-sdk integration
-- This enables organizations to use JWT authentication with the QueryPanel SDK
-- without requiring separate environment variables
-- Uses Supabase Vault for secure storage (same pattern as datasources)

-- Add private_key_secret_id column (references vault.secrets)
ALTER TABLE public_keys 
ADD COLUMN IF NOT EXISTS private_key_secret_id UUID;

-- Add key_format column to distinguish between PEM and JWK formats
ALTER TABLE public_keys
ADD COLUMN IF NOT EXISTS key_format TEXT DEFAULT 'PEM' CHECK (key_format IN ('PEM', 'JWK'));

-- Add description column for better key management
ALTER TABLE public_keys
ADD COLUMN IF NOT EXISTS description TEXT;

-- Comment on new columns
COMMENT ON COLUMN public_keys.private_key_secret_id IS 'Supabase Vault secret ID for private key (optional, for SDK integration). Used same way as datasources.password_secret_id';
COMMENT ON COLUMN public_keys.key_format IS 'Format of the stored keys (PEM or JWK)';
COMMENT ON COLUMN public_keys.description IS 'Optional description of key usage or purpose';

-- Note: private_key_secret_id references vault.secrets for secure storage
-- The column allows NULL because:
-- 1. Existing keys may not have private keys stored
-- 2. Some organizations may only need public keys for verification
-- 3. Organizations can choose to manage private keys externally
