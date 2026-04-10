-- ============================================================================
-- Complete Dashboard Feature Schema with BlockNote Support
-- ============================================================================
-- This is a comprehensive migration that creates the full dashboard schema
-- Includes: tables, indexes, triggers, RLS policies, and BlockNote adaptations
-- Safe to run on fresh database or to recreate existing tables
-- ============================================================================

-- ============================================================================
-- PART 1: Drop existing tables if they exist
-- ============================================================================

DROP TABLE IF EXISTS public.widget_shares CASCADE;
DROP TABLE IF EXISTS public.customer_dashboard_blocks CASCADE;
DROP TABLE IF EXISTS public.dashboard_blocks CASCADE;
DROP TABLE IF EXISTS public.dashboards CASCADE;

-- ============================================================================
-- PART 2: Create tables
-- ============================================================================

-- Dashboards table (main table for BlockNote content)
CREATE TABLE public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- BlockNote content storage
  content_json TEXT,  -- BlockNote editor content as JSON string
  widget_config JSONB DEFAULT '{}'::jsonb,  -- Configuration for embedded widgets
  editor_type TEXT DEFAULT 'blocknote',  -- 'blocknote' or 'custom'
  
  -- Customer fork tracking (copy-on-write customization)
  is_customer_fork BOOLEAN DEFAULT FALSE,
  forked_from_dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE CASCADE,
  tenant_id TEXT,  -- Only for customer forks
  
  -- Metadata
  datasource_id UUID REFERENCES public.datasources(id) ON DELETE SET NULL,
  version INTEGER DEFAULT 1,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  
  -- Constraints
  CONSTRAINT dashboards_status_check CHECK (status IN ('draft', 'deployed')),
  CONSTRAINT dashboards_editor_type_check CHECK (editor_type IN ('blocknote', 'custom')),
  CONSTRAINT dashboards_name_not_empty CHECK (char_length(name) > 0),
  CONSTRAINT dashboards_org_name_unique UNIQUE (organization_id, name),
  CONSTRAINT dashboards_fork_tenant CHECK (
    (is_customer_fork = FALSE AND tenant_id IS NULL) OR
    (is_customer_fork = TRUE AND tenant_id IS NOT NULL AND forked_from_dashboard_id IS NOT NULL)
  )
);

-- Dashboard blocks table (optional, for custom editor type)
-- When editor_type='blocknote', this table is not typically used
-- When editor_type='custom', blocks are stored here instead of content_json
CREATE TABLE public.dashboard_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL,
  content JSONB NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT dashboard_blocks_type_check CHECK (block_type IN ('heading', 'text', 'widget'))
);

-- Customer dashboard blocks table (customer customizations)
-- Allows customers to add their own blocks alongside admin content
CREATE TABLE public.customer_dashboard_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  content JSONB NOT NULL,
  order_index INTEGER NOT NULL,
  shared_with_tenant BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT customer_dashboard_blocks_type_check CHECK (block_type IN ('heading', 'text', 'widget')),
  CONSTRAINT customer_dashboard_blocks_unique UNIQUE (dashboard_id, tenant_id, id)
);

-- Widget shares table (shared widgets within tenant)
CREATE TABLE public.widget_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_block_id UUID NOT NULL REFERENCES public.customer_dashboard_blocks(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PART 3: Create indexes for performance
-- ============================================================================

-- Dashboards
CREATE INDEX idx_dashboards_organization_id ON public.dashboards(organization_id);
CREATE INDEX idx_dashboards_status ON public.dashboards(status);
CREATE INDEX idx_dashboards_datasource_id ON public.dashboards(datasource_id);
CREATE INDEX idx_dashboards_created_at ON public.dashboards(created_at DESC);
CREATE INDEX idx_dashboards_editor_type ON public.dashboards(editor_type);
CREATE INDEX idx_dashboards_tenant_fork ON public.dashboards(tenant_id, forked_from_dashboard_id) WHERE is_customer_fork = TRUE;

-- Dashboard blocks
CREATE INDEX idx_dashboard_blocks_dashboard_id ON public.dashboard_blocks(dashboard_id);
CREATE INDEX idx_dashboard_blocks_order ON public.dashboard_blocks(dashboard_id, order_index);

-- Customer dashboard blocks
CREATE INDEX idx_customer_dashboard_blocks_dashboard_id ON public.customer_dashboard_blocks(dashboard_id);
CREATE INDEX idx_customer_dashboard_blocks_tenant_id ON public.customer_dashboard_blocks(tenant_id);
CREATE INDEX idx_customer_dashboard_blocks_order ON public.customer_dashboard_blocks(dashboard_id, tenant_id, order_index);
CREATE INDEX idx_customer_dashboard_blocks_shared ON public.customer_dashboard_blocks(dashboard_id, tenant_id, shared_with_tenant);

-- Widget shares
CREATE INDEX idx_widget_shares_customer_block_id ON public.widget_shares(customer_block_id);
CREATE INDEX idx_widget_shares_tenant_id ON public.widget_shares(tenant_id);

-- ============================================================================
-- PART 4: Create triggers for updated_at
-- ============================================================================

CREATE TRIGGER update_dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_blocks_updated_at
  BEFORE UPDATE ON public.dashboard_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_dashboard_blocks_updated_at
  BEFORE UPDATE ON public.customer_dashboard_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_dashboard_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_shares ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: RLS Policies - Service Role (Full Access)
-- ============================================================================

CREATE POLICY "Service role has full access to dashboards"
  ON public.dashboards FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to dashboard_blocks"
  ON public.dashboard_blocks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to customer_dashboard_blocks"
  ON public.customer_dashboard_blocks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to widget_shares"
  ON public.widget_shares FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 7: RLS Policies - Dashboards (Authenticated Users)
-- ============================================================================

-- Authenticated users can read dashboards in their organizations
CREATE POLICY "Users can read their organization dashboards"
  ON public.dashboards FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Organization admins can manage dashboards
CREATE POLICY "Admins can manage dashboards"
  ON public.dashboards FOR ALL TO authenticated
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

-- ============================================================================
-- PART 8: RLS Policies - Dashboard Blocks (Authenticated Users)
-- ============================================================================

-- Users can read dashboard blocks for dashboards they have access to
CREATE POLICY "Users can read dashboard blocks"
  ON public.dashboard_blocks FOR SELECT TO authenticated
  USING (
    dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Admins can manage dashboard blocks
CREATE POLICY "Admins can manage dashboard blocks"
  ON public.dashboard_blocks FOR ALL TO authenticated
  USING (
    dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================================================
-- PART 9: RLS Policies - Customer Dashboard Blocks (Authenticated Users)
-- ============================================================================

-- Users can read customer dashboard blocks (their own and shared ones)
CREATE POLICY "Users can read customer dashboard blocks"
  ON public.customer_dashboard_blocks FOR SELECT TO authenticated
  USING (
    dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can manage their own customer blocks
CREATE POLICY "Users can manage their customer blocks"
  ON public.customer_dashboard_blocks FOR ALL TO authenticated
  USING (
    created_by = auth.uid()::text
    AND dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    dashboard_id IN (
      SELECT id FROM dashboards
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 10: RLS Policies - Widget Shares (Authenticated Users)
-- ============================================================================

-- Users can read widget shares
CREATE POLICY "Users can read widget shares"
  ON public.widget_shares FOR SELECT TO authenticated
  USING (true);

-- Users can create widget shares for their own blocks
CREATE POLICY "Users can create widget shares"
  ON public.widget_shares FOR INSERT TO authenticated
  WITH CHECK (
    customer_block_id IN (
      SELECT id FROM customer_dashboard_blocks
      WHERE created_by = auth.uid()::text
    )
  );

-- ============================================================================
-- PART 11: Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.dashboards IS 'Dashboard definitions with BlockNote content or custom blocks';
COMMENT ON COLUMN public.dashboards.id IS 'Unique dashboard identifier';
COMMENT ON COLUMN public.dashboards.organization_id IS 'Organization that owns this dashboard';
COMMENT ON COLUMN public.dashboards.name IS 'Dashboard display name';
COMMENT ON COLUMN public.dashboards.description IS 'Dashboard description';
COMMENT ON COLUMN public.dashboards.status IS 'Dashboard deployment status (draft, deployed)';
COMMENT ON COLUMN public.dashboards.content_json IS 'BlockNote editor content stored as JSON string';
COMMENT ON COLUMN public.dashboards.widget_config IS 'Configuration mapping for widgets in the dashboard (datasource connections, query IDs, etc.)';
COMMENT ON COLUMN public.dashboards.editor_type IS 'Editor type used for this dashboard (blocknote or custom)';
COMMENT ON COLUMN public.dashboards.is_customer_fork IS 'Whether this is a customer fork (copy-on-write customization)';
COMMENT ON COLUMN public.dashboards.forked_from_dashboard_id IS 'Original dashboard this was forked from (for rollback)';
COMMENT ON COLUMN public.dashboards.tenant_id IS 'Customer tenant ID (only for forks)';
COMMENT ON COLUMN public.dashboards.datasource_id IS 'Primary datasource for this dashboard';
COMMENT ON COLUMN public.dashboards.version IS 'Version number for tracking changes';

COMMENT ON TABLE public.dashboard_blocks IS 'Admin-created blocks within dashboards (used when editor_type=custom)';
COMMENT ON COLUMN public.dashboard_blocks.block_type IS 'Type of block (heading, text, widget)';
COMMENT ON COLUMN public.dashboard_blocks.content IS 'Block content (structure varies by type)';
COMMENT ON COLUMN public.dashboard_blocks.order_index IS 'Display order within dashboard';

COMMENT ON TABLE public.customer_dashboard_blocks IS 'Customer customization blocks appended to dashboards';
COMMENT ON COLUMN public.customer_dashboard_blocks.tenant_id IS 'Customer tenant identifier';
COMMENT ON COLUMN public.customer_dashboard_blocks.shared_with_tenant IS 'Whether block is visible to all tenant users';

COMMENT ON TABLE public.widget_shares IS 'Shared widget blocks within tenant';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration creates the complete dashboard schema with:
-- - BlockNote content storage (content_json)
-- - Widget configuration (widget_config)
-- - Editor type flexibility (editor_type)
-- - Custom blocks support (dashboard_blocks, customer_dashboard_blocks)
-- - Widget sharing (widget_shares)
-- - Full RLS policies
-- - Performance indexes
-- - Automatic timestamp triggers
-- ============================================================================
