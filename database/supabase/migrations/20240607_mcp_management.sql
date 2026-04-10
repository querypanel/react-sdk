-- MCP Management Feature Migration

-- 1. Table: available_mcps
CREATE TABLE IF NOT EXISTS available_mcps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  default_envs JSONB,
  tools JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table: customer_mcps
CREATE TABLE IF NOT EXISTS customer_mcps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  mcp_id UUID NOT NULL REFERENCES available_mcps(id) ON DELETE CASCADE,
  name TEXT,
  envs JSONB NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_customer_mcps_user_id ON customer_mcps(user_id);
-- Index for quick lookup by mcp
CREATE INDEX IF NOT EXISTS idx_customer_mcps_mcp_id ON customer_mcps(mcp_id);

-- View: v_mcps_with_customer
CREATE OR REPLACE VIEW v_mcps_with_customer AS
SELECT
  a.id AS mcp_id,
  a.name AS mcp_name,
  a.description AS mcp_description,
  a.icon_url,
  a.default_envs,
  a.tools,
  a.created_at AS mcp_created_at,
  c.id AS customer_mcp_id,
  c.user_id,
  c.envs,
  c.is_enabled,
  c.created_at AS customer_created_at,
  c.updated_at AS customer_updated_at
FROM available_mcps a
LEFT JOIN customer_mcps c
  ON a.id = c.mcp_id; 