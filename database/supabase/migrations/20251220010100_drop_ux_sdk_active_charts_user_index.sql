-- Drop the unique index that enforces a single active chart per user
-- This allows multiple active charts for the same (organization_id, tenant_id, user_id)

DROP INDEX IF EXISTS ux_sdk_active_charts_tenant;
DROP INDEX IF EXISTS ux_sdk_active_charts_user;
