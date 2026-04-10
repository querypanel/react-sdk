-- Dashboard-level available datasources and tenant field for customer embed
-- Admins configure which datasources and tenant column name are offered when customers customize the dashboard.

ALTER TABLE public.dashboards
  ADD COLUMN IF NOT EXISTS available_datasource_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tenant_field_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tenant_field_by_datasource JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dashboards.available_datasource_ids IS 'Datasource IDs allowed for this dashboard when customers add/modify charts. NULL means all org datasources.';
COMMENT ON COLUMN public.dashboards.tenant_field_name IS 'Default column name for tenant isolation in generated SQL. Used when no per-datasource override is set.';
COMMENT ON COLUMN public.dashboards.tenant_field_by_datasource IS 'Per-datasource tenant column name: { "datasource_uuid": "tenant_id", ... }. Overrides tenant_field_name for each datasource.';
