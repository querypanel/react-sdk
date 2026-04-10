-- ============================================================================
-- Restore org admin/owner member management RLS policies
-- ============================================================================

-- These policies are required for endpoints like:
-- POST /api/organizations/members (invites a different user into the org)
-- The caller (auth.uid()) must already be an admin/owner in the org.

-- Ensure helper functions exist for the current schema (organization_id column).
-- These should match the earlier "fix_org_functions" migration, but we keep this
-- migration robust in case of policy/function drift.
CREATE OR REPLACE FUNCTION fn_is_org_member(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_is_org_admin(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  );
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_is_org_owner(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Ensure authenticated can execute the helper functions used in policies.
-- (The helper functions are defined in earlier migrations.)
GRANT EXECUTE ON FUNCTION fn_is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_org_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_org_owner(UUID) TO authenticated;

-- Replace any existing policies with the same names to avoid drift.
DROP POLICY IF EXISTS "Org admins can add members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can remove members" ON organization_members;

-- INSERT: allow org admins/owners to add *other* users to their org
CREATE POLICY "Org admins can add members"
  ON organization_members FOR INSERT
  WITH CHECK (fn_is_org_admin(organization_id));

-- UPDATE: allow org admins/owners to update memberships inside their org
CREATE POLICY "Org admins can update members"
  ON organization_members FOR UPDATE
  USING (fn_is_org_admin(organization_id))
  WITH CHECK (fn_is_org_admin(organization_id));

-- DELETE: allow org admins/owners to remove memberships inside their org
CREATE POLICY "Org admins can remove members"
  ON organization_members FOR DELETE
  USING (fn_is_org_admin(organization_id));

