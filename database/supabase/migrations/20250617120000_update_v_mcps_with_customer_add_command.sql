-- Migration: Add command columns to v_mcps_with_customer view
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
  c.updated_at AS customer_updated_at,
  a.command AS mcp_command,
  c.command AS customer_command
FROM available_mcps a
LEFT JOIN customer_mcps c
  ON a.id = c.mcp_id; 