-- Add plan_id to organizations table for server SDK
-- This allows direct plan lookup when customers call APIs with organizationId

-- Add plan_id column to organizations table
ALTER TABLE organizations 
ADD COLUMN plan_id INT REFERENCES plans(id) ON DELETE SET NULL;

-- Add index for faster plan lookups
CREATE INDEX idx_organizations_plan_id ON organizations(plan_id);

-- Update RLS policy to allow plan access
-- Organizations: members can view org and its plan
CREATE POLICY "Org members can view org and plan" ON organizations FOR SELECT USING (
  id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  OR owner_id = auth.uid()
);

-- Add comment explaining the change
COMMENT ON COLUMN organizations.plan_id IS 'Direct plan reference for server SDK API calls with organizationId';
