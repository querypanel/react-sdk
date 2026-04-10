-- Enforce one-organization-per-user at DB level with unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_owner_id_unique'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_owner_id_unique UNIQUE (owner_id);
  END IF;
END $$;

-- Set default value for joined_at to now() so members are automatically marked as joined
ALTER TABLE organization_members ALTER COLUMN joined_at SET DEFAULT now();

-- Add missing RLS policies for organizations SELECT, INSERT, UPDATE, DELETE
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Org members or owner can view org" ON organizations;
DROP POLICY IF EXISTS "Users can create their own organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their own organization" ON organizations;
DROP POLICY IF EXISTS "Users can delete their own organization" ON organizations;

-- SELECT policy: owner or members can view their organization
CREATE POLICY "Org members or owner can view org" ON organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM organization_members m
      WHERE m.org_id = organizations.id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT policy: authenticated users can create an organization with themselves as owner
CREATE POLICY "Users can create their own organization" ON organizations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = owner_id
  );

-- UPDATE policy: organization owner or members can update their organization
CREATE POLICY "Users can update their own organization" ON organizations FOR UPDATE
  USING (owner_id = auth.uid() OR id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- DELETE policy: only the owner can delete their organization
CREATE POLICY "Users can delete their own organization" ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- Add missing RLS policies for organization_members SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Org users can view memberships" ON organization_members;
DROP POLICY IF EXISTS "Org admins can add members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can remove members" ON organization_members;

-- Helper functions to evaluate membership/roles without recursion
-- SECURITY DEFINER so they bypass RLS safely
CREATE OR REPLACE FUNCTION public.fn_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid() AND role IN ('admin','owner')
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.fn_is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_org_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_org_owner(uuid) TO authenticated;

-- SELECT policy: any member of the organization can view all memberships in that org
CREATE POLICY "Org users can view memberships" ON organization_members FOR SELECT
  USING (fn_is_org_member(org_id));

-- INSERT policy: only admins/owners can add members into their org
CREATE POLICY "Org admins can add members" ON organization_members FOR INSERT
  WITH CHECK (fn_is_org_admin(org_id));

-- UPDATE policy: only admins/owners can modify memberships in their org
CREATE POLICY "Org admins can update members" ON organization_members FOR UPDATE
  USING (fn_is_org_admin(org_id))
  WITH CHECK (fn_is_org_admin(org_id));

-- DELETE policy: only admins/owners can remove memberships in their org
CREATE POLICY "Org admins can remove members" ON organization_members FOR DELETE
  USING (fn_is_org_admin(org_id));

