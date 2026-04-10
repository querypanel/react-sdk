-- Create sdk_charts table for saving SDK chart results
-- This table stores chart data generated through the SDK endpoints

CREATE TABLE IF NOT EXISTS sdk_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  tenant_id TEXT,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  vega_lite_spec JSONB NOT NULL,
  sql TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sdk_charts_query_id ON sdk_charts(query_id);
CREATE INDEX IF NOT EXISTS idx_sdk_charts_organization_id ON sdk_charts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sdk_charts_tenant_id ON sdk_charts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdk_charts_user_id ON sdk_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_sdk_charts_created_at ON sdk_charts(created_at DESC);

-- Create updated_at trigger (reuse existing function)
CREATE TRIGGER update_sdk_charts_updated_at BEFORE UPDATE ON sdk_charts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE sdk_charts ENABLE ROW LEVEL SECURITY;

-- RLS: By default no access
DROP POLICY IF EXISTS "sdk_charts_select" ON sdk_charts;
DROP POLICY IF EXISTS "sdk_charts_insert" ON sdk_charts;
DROP POLICY IF EXISTS "sdk_charts_update" ON sdk_charts;
DROP POLICY IF EXISTS "sdk_charts_delete" ON sdk_charts;

-- SELECT: allow a user to see rows where they are the owner, or
-- they belong to the organization via organization_members, or they are the org owner
CREATE POLICY "sdk_charts_select" ON sdk_charts FOR SELECT USING (
  -- user may view their own rows (user_id equals auth.uid())
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      -- org owner
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
      OR
      -- org member
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- INSERT: allow authenticated users to insert; server validates via API route
CREATE POLICY "sdk_charts_insert" ON sdk_charts FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

-- UPDATE: allow users to update their own charts or charts within their organization
CREATE POLICY "sdk_charts_update" ON sdk_charts FOR UPDATE USING (
  -- user may update their own rows (user_id equals auth.uid())
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      -- org owner
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
      OR
      -- org member
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- DELETE: allow users to delete their own charts or charts within their organization (if they're owner)
CREATE POLICY "sdk_charts_delete" ON sdk_charts FOR DELETE USING (
  -- user may delete their own rows (user_id equals auth.uid())
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      -- org owner only
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  )
);

-- Add table and column comments for documentation
COMMENT ON TABLE sdk_charts IS 'Stores chart data generated through SDK endpoints';
COMMENT ON COLUMN sdk_charts.id IS 'Primary key for the chart record';
COMMENT ON COLUMN sdk_charts.query_id IS 'Optional identifier linking to a specific query or request';
COMMENT ON COLUMN sdk_charts.organization_id IS 'Organization that owns this chart';
COMMENT ON COLUMN sdk_charts.tenant_id IS 'Customer tenant identifier provided by the caller';
COMMENT ON COLUMN sdk_charts.user_id IS 'End user identifier provided by the caller';
COMMENT ON COLUMN sdk_charts.title IS 'Human-readable title for the chart';
COMMENT ON COLUMN sdk_charts.description IS 'Optional description of what the chart represents';
COMMENT ON COLUMN sdk_charts.vega_lite_spec IS 'Vega-Lite specification for rendering the chart';
COMMENT ON COLUMN sdk_charts.sql IS 'SQL query used to generate the chart data';
COMMENT ON COLUMN sdk_charts.created_at IS 'Timestamp when the chart was created';
COMMENT ON COLUMN sdk_charts.updated_at IS 'Timestamp when the chart was last updated';
