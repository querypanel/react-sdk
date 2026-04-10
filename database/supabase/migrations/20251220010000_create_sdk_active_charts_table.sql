-- Create sdk_active_charts table to manage active chart per tenant/user

CREATE TABLE IF NOT EXISTS sdk_active_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  tenant_id TEXT,
  user_id TEXT,
  chart_id UUID NOT NULL REFERENCES sdk_charts(id) ON DELETE CASCADE,
  "order" INTEGER,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sdk_active_charts_organization_id ON sdk_active_charts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sdk_active_charts_tenant_id ON sdk_active_charts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdk_active_charts_user_id ON sdk_active_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_sdk_active_charts_chart_id ON sdk_active_charts(chart_id);
CREATE INDEX IF NOT EXISTS idx_sdk_active_charts_created_at ON sdk_active_charts(created_at DESC);

-- Enforce single active chart per (organization_id, tenant_id) at tenant scope
CREATE UNIQUE INDEX IF NOT EXISTS ux_sdk_active_charts_tenant
  ON sdk_active_charts(organization_id, tenant_id)
  WHERE user_id IS NULL;

-- Enforce single active chart per (organization_id, tenant_id, user_id) at user scope
CREATE UNIQUE INDEX IF NOT EXISTS ux_sdk_active_charts_user
  ON sdk_active_charts(organization_id, tenant_id, user_id)
  WHERE user_id IS NOT NULL;

-- updated_at trigger (reuses existing function update_updated_at_column)
CREATE TRIGGER update_sdk_active_charts_updated_at BEFORE UPDATE ON sdk_active_charts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE sdk_active_charts ENABLE ROW LEVEL SECURITY;

-- RLS: reset existing policies if any
DROP POLICY IF EXISTS "sdk_active_charts_select" ON sdk_active_charts;
DROP POLICY IF EXISTS "sdk_active_charts_insert" ON sdk_active_charts;
DROP POLICY IF EXISTS "sdk_active_charts_update" ON sdk_active_charts;
DROP POLICY IF EXISTS "sdk_active_charts_delete" ON sdk_active_charts;

-- SELECT: allow owners and org members/owners (mirrors sdk_charts)
CREATE POLICY "sdk_active_charts_select" ON sdk_active_charts FOR SELECT USING (
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- INSERT: allow authenticated users (server side validates associations)
CREATE POLICY "sdk_active_charts_insert" ON sdk_active_charts FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

-- UPDATE: allow owners and org members/owners (mirrors sdk_charts)
CREATE POLICY "sdk_active_charts_update" ON sdk_active_charts FOR UPDATE USING (
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- DELETE: allow owners and org owners
CREATE POLICY "sdk_active_charts_delete" ON sdk_active_charts FOR DELETE USING (
  user_id = auth.uid()::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  )
);

-- Comments for documentation
COMMENT ON TABLE sdk_active_charts IS 'Tracks which SDK chart is active for a tenant or user';
COMMENT ON COLUMN sdk_active_charts.id IS 'Primary key for the active chart mapping';
COMMENT ON COLUMN sdk_active_charts.organization_id IS 'Owning organization context for the active selection';
COMMENT ON COLUMN sdk_active_charts.tenant_id IS 'Customer tenant identifier';
COMMENT ON COLUMN sdk_active_charts.user_id IS 'End user identifier; NULL means tenant-level default';
COMMENT ON COLUMN sdk_active_charts.chart_id IS 'Reference to sdk_charts(id) for the active chart';
COMMENT ON COLUMN sdk_active_charts."order" IS 'Sort order for dashboard placement';
COMMENT ON COLUMN sdk_active_charts.meta IS 'Additional customer-provided metadata as JSON';
COMMENT ON COLUMN sdk_active_charts.created_at IS 'When the active mapping was created';
COMMENT ON COLUMN sdk_active_charts.updated_at IS 'When the active mapping was last updated';


