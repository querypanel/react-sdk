-- Optimize public_keys lookups by org_id where is_active = true
-- Existing indexes (from prior migrations):
--   idx_public_keys_org_id (org_id)
--   idx_public_keys_is_active (is_active)
--   idx_public_keys_key_type (key_type)
-- This partial covering index targets the common filter and returns public_key fast.

CREATE INDEX IF NOT EXISTS idx_public_keys_org_active_true
  ON public_keys (org_id)
  INCLUDE (public_key)
  WHERE is_active = true;


