-- Create schema_sync_state table to track schema introspection results per organization and database
CREATE TABLE IF NOT EXISTS public.schema_sync_state (
  organization_id uuid        NOT NULL,
  database_name   text        NOT NULL,
  schema_hash     text        NOT NULL,
  introspected_at timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, database_name)
);

-- Helpful index for org-scoped queries
CREATE INDEX IF NOT EXISTS schema_sync_state_org_idx
  ON public.schema_sync_state (organization_id);

-- updated_at trigger (reuses update_updated_at_column if present from earlier migrations)
DO $$ BEGIN
  PERFORM 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column';
  IF NOT FOUND THEN
    -- Create the helper if it does not exist yet (idempotent across environments)
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_schema_sync_state_updated_at ON public.schema_sync_state;
CREATE TRIGGER update_schema_sync_state_updated_at
  BEFORE UPDATE ON public.schema_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.schema_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS policies: organization-scoped access for members and owners
DO $$ BEGIN
  DROP POLICY IF EXISTS "schema_sync_state_select" ON public.schema_sync_state;
  DROP POLICY IF EXISTS "schema_sync_state_insert" ON public.schema_sync_state;
  DROP POLICY IF EXISTS "schema_sync_state_update" ON public.schema_sync_state;
  DROP POLICY IF EXISTS "schema_sync_state_delete" ON public.schema_sync_state;
EXCEPTION WHEN undefined_object THEN NULL; END $$ LANGUAGE plpgsql;

-- Allow org members and owners to read rows for their organization
CREATE POLICY "schema_sync_state_select" ON public.schema_sync_state
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Allow org members and owners to insert rows scoped to their organization
CREATE POLICY "schema_sync_state_insert" ON public.schema_sync_state
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Allow org members and owners to update rows scoped to their organization
CREATE POLICY "schema_sync_state_update" ON public.schema_sync_state
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = (SELECT auth.uid())
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Allow org owners and members to delete rows scoped to their organization
CREATE POLICY "schema_sync_state_delete" ON public.schema_sync_state
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Optional documentation comments
COMMENT ON TABLE public.schema_sync_state IS 'Tracks per-organization database schema introspection state and hash';
COMMENT ON COLUMN public.schema_sync_state.organization_id IS 'Owning organization';
COMMENT ON COLUMN public.schema_sync_state.database_name IS 'Logical database name for the source';
COMMENT ON COLUMN public.schema_sync_state.schema_hash IS 'Hash of the last introspected schema';
COMMENT ON COLUMN public.schema_sync_state.introspected_at IS 'Timestamp of the last successful introspection';
COMMENT ON COLUMN public.schema_sync_state.created_at IS 'Row creation timestamp';
COMMENT ON COLUMN public.schema_sync_state.updated_at IS 'Row last update timestamp';
