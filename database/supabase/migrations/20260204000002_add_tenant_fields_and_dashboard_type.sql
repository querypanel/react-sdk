-- Add tenant configuration to datasources and dashboard_type to dashboards

ALTER TABLE public.datasources
  ADD COLUMN IF NOT EXISTS tenant_field_name TEXT,
  ADD COLUMN IF NOT EXISTS tenant_field_type TEXT DEFAULT 'String';

COMMENT ON COLUMN public.datasources.tenant_field_name IS 'Column name used for tenant isolation (e.g., tenant_id, customer_id).';
COMMENT ON COLUMN public.datasources.tenant_field_type IS 'Type for tenant field (String, Number, UUID).';

ALTER TABLE public.dashboards
  ADD COLUMN IF NOT EXISTS dashboard_type TEXT NOT NULL DEFAULT 'customer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboards_dashboard_type_check'
      AND conrelid = 'public.dashboards'::regclass
  ) THEN
    ALTER TABLE public.dashboards
      ADD CONSTRAINT dashboards_dashboard_type_check
      CHECK (dashboard_type IN ('customer', 'internal'));
  END IF;
END $$;
