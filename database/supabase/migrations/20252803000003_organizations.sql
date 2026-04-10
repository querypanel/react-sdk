-- ============================================================================
-- Organizations, Members, and Public Keys Schema
-- ============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID,
  plan_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT organizations_name_not_empty CHECK (char_length(name) > 0)
);

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
  id SERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT organization_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT organization_members_unique_user_org UNIQUE (organization_id, user_id)
);

-- Public Keys table for JWT verification
CREATE TABLE IF NOT EXISTS public_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  key_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT public_keys_key_type_check CHECK (key_type IN ('RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512')),
  CONSTRAINT public_keys_name_not_empty CHECK (char_length(name) > 0),
  CONSTRAINT public_keys_unique_org_name UNIQUE (organization_id, name)
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================

-- Organizations
CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

-- Organization members
CREATE INDEX idx_organization_members_organization_id ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_organization_members_role ON organization_members(role);

-- Public keys
CREATE INDEX idx_public_keys_organization_id ON public_keys(organization_id);
CREATE INDEX idx_public_keys_org_active ON public_keys(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_public_keys_created_at ON public_keys(created_at DESC);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_public_keys_updated_at
  BEFORE UPDATE ON public_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_keys ENABLE ROW LEVEL SECURITY;

-- Service role has full access to everything
CREATE POLICY "Service role has full access to organizations"
  ON organizations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to organization_members"
  ON organization_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to public_keys"
  ON public_keys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read organizations they belong to
CREATE POLICY "Users can read their organizations"
  ON organizations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can read members of their organizations
CREATE POLICY "Users can read their organization members"
  ON organization_members FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Organization owners/admins can manage members
CREATE POLICY "Admins can manage organization members"
  ON organization_members FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Users can read public keys for their organizations
CREATE POLICY "Users can read their organization public keys"
  ON public_keys FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Organization owners/admins can manage public keys
CREATE POLICY "Admins can manage public keys"
  ON public_keys FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Anonymous users can read active public keys (for JWT verification)
CREATE POLICY "Anonymous can read active public keys"
  ON public_keys FOR SELECT TO anon
  USING (is_active = true);

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Function to check if user is organization member
CREATE OR REPLACE FUNCTION is_organization_member(user_uuid UUID, organization_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = user_uuid AND organization_id = organization_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific role in organization
CREATE OR REPLACE FUNCTION has_organization_role(user_uuid UUID, organization_uuid UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = user_uuid
    AND organization_id = organization_uuid
    AND role = required_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role in organization
CREATE OR REPLACE FUNCTION get_user_organization_role(user_uuid UUID, organization_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE user_id = user_uuid AND organization_id = organization_uuid;

  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE organizations IS 'Organizations/tenants in the system';
COMMENT ON COLUMN organizations.id IS 'Unique organization identifier';
COMMENT ON COLUMN organizations.name IS 'Organization display name';
COMMENT ON COLUMN organizations.owner_id IS 'User ID of the organization owner';
COMMENT ON COLUMN organizations.plan_id IS 'Subscription plan ID';

COMMENT ON TABLE organization_members IS 'Members belonging to organizations';
COMMENT ON COLUMN organization_members.organization_id IS 'Organization this member belongs to';
COMMENT ON COLUMN organization_members.user_id IS 'User ID of the member';
COMMENT ON COLUMN organization_members.role IS 'Role within the organization (owner, admin, member, viewer)';
COMMENT ON COLUMN organization_members.invited_by IS 'User ID who invited this member';

COMMENT ON TABLE public_keys IS 'RSA/ECDSA public keys for JWT verification per organization';
COMMENT ON COLUMN public_keys.organization_id IS 'Organization that owns this public key';
COMMENT ON COLUMN public_keys.name IS 'Friendly name for the key (e.g., "production-2024")';
COMMENT ON COLUMN public_keys.public_key IS 'PEM-encoded public key or JWK JSON string';
COMMENT ON COLUMN public_keys.key_type IS 'Algorithm type (RS256, ES256, etc.)';
COMMENT ON COLUMN public_keys.is_active IS 'Whether this key is currently valid for verification';
