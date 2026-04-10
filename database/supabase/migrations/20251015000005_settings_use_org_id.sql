-- Migrate settings-related tables to organization scope

-- public_keys: add org_id and index; keep user_id for now (deprecated)
ALTER TABLE public_keys ADD COLUMN IF NOT EXISTS org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_public_keys_org_id ON public_keys(org_id);


-- connector_credentials: add org_id and index; keep user_id for now (deprecated)
ALTER TABLE connector_credentials ADD COLUMN IF NOT EXISTS org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_connector_credentials_org_id ON connector_credentials(org_id);

-- vector_training_sessions: add org_id and index; keep user_id for now (deprecated)
ALTER TABLE vector_training_sessions ADD COLUMN IF NOT EXISTS org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vector_training_sessions_org_id ON vector_training_sessions(org_id);

-- Enable RLS if not enabled and add org-scoped policies
ALTER TABLE public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_training_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to replace with org-based where applicable
DO $$ BEGIN
  DROP POLICY IF EXISTS "public_keys_select" ON public_keys;
  DROP POLICY IF EXISTS "public_keys_modify" ON public_keys;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "public_keys_select" ON public_keys FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);

CREATE POLICY "public_keys_modify" ON public_keys FOR ALL USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);


DO $$ BEGIN
  DROP POLICY IF EXISTS "connector_credentials_select" ON connector_credentials;
  DROP POLICY IF EXISTS "connector_credentials_modify" ON connector_credentials;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "connector_credentials_select" ON connector_credentials FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);

CREATE POLICY "connector_credentials_modify" ON connector_credentials FOR ALL USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);

DO $$ BEGIN
  DROP POLICY IF EXISTS "vector_training_sessions_select" ON vector_training_sessions;
  DROP POLICY IF EXISTS "vector_training_sessions_modify" ON vector_training_sessions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "vector_training_sessions_select" ON vector_training_sessions FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);

CREATE POLICY "vector_training_sessions_modify" ON vector_training_sessions FOR ALL USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ))
);

COMMENT ON COLUMN public_keys.org_id IS 'Organization owner for this key';
COMMENT ON COLUMN connector_credentials.org_id IS 'Owning organization';
COMMENT ON COLUMN vector_training_sessions.org_id IS 'Owning organization';


-- Remove user_id columns from org-scoped tables
-- These tables now use org_id exclusively for access control

-- Drop old user-based policies before dropping user_id columns
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own public keys" ON public_keys;
  DROP POLICY IF EXISTS "Users can insert their own public keys" ON public_keys;
  DROP POLICY IF EXISTS "Users can update their own public keys" ON public_keys;
  DROP POLICY IF EXISTS "Users can delete their own public keys" ON public_keys;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Drop user_id from public_keys
ALTER TABLE public_keys DROP COLUMN IF EXISTS user_id;

-- Drop old user-based policies for connector_credentials
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own connector credentials" ON connector_credentials;
  DROP POLICY IF EXISTS "Users can insert their own connector credentials" ON connector_credentials;
  DROP POLICY IF EXISTS "Users can update their own connector credentials" ON connector_credentials;
  DROP POLICY IF EXISTS "Users can delete their own connector credentials" ON connector_credentials;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Drop user_id from connector_credentials  
ALTER TABLE connector_credentials DROP COLUMN IF EXISTS user_id;

-- Drop old user-based policies for vector_training_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own training sessions" ON vector_training_sessions;
  DROP POLICY IF EXISTS "Users can insert their own training sessions" ON vector_training_sessions;
  DROP POLICY IF EXISTS "Users can update their own training sessions" ON vector_training_sessions;
  DROP POLICY IF EXISTS "Users can delete their own training sessions" ON vector_training_sessions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Drop user_id from vector_training_sessions
ALTER TABLE vector_training_sessions DROP COLUMN IF EXISTS user_id;

-- Make org_id NOT NULL since it's now required
ALTER TABLE public_keys ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE connector_credentials ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE vector_training_sessions ALTER COLUMN org_id SET NOT NULL;


