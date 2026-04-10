-- ============================================================================
-- Fix organization helper functions to use organization_id instead of org_id
-- ============================================================================

-- Drop and recreate fn_is_org_member with organization_id (CASCADE to drop dependent policies)
DROP FUNCTION IF EXISTS fn_is_org_member(UUID) CASCADE;

CREATE OR REPLACE FUNCTION fn_is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Drop and recreate fn_is_org_admin with organization_id
DROP FUNCTION IF EXISTS fn_is_org_admin(UUID) CASCADE;

CREATE OR REPLACE FUNCTION fn_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND role IN ('admin','owner')
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Drop and recreate fn_is_org_owner with organization_id
DROP FUNCTION IF EXISTS fn_is_org_owner(UUID) CASCADE;

CREATE OR REPLACE FUNCTION fn_is_org_owner(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Recreate the dropped policy for organization_members
CREATE POLICY "Org users can view memberships" 
  ON organization_members FOR SELECT 
  USING (fn_is_org_member(organization_id));

COMMENT ON FUNCTION fn_is_org_member IS 'Check if current user is a member of the given organization';
COMMENT ON FUNCTION fn_is_org_admin IS 'Check if current user is an admin or owner of the given organization';
COMMENT ON FUNCTION fn_is_org_owner IS 'Check if current user is the owner of the given organization';
