-- Create sql_logs table for tracking SQL generation and execution
CREATE TABLE IF NOT EXISTS public.sql_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sql TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '[]'::jsonb,
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'FAILED', 'SUCCESS')),
  question TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  dialect TEXT NOT NULL,
  rationale TEXT,
  parent_log_id UUID REFERENCES public.sql_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX idx_sql_logs_org_tenant_state_created
  ON public.sql_logs(organization_id, tenant_id, state, created_at DESC);

CREATE INDEX idx_sql_logs_parent
  ON public.sql_logs(parent_log_id) WHERE parent_log_id IS NOT NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_sql_logs_updated_at
  BEFORE UPDATE ON public.sql_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.sql_logs IS 'Tracks SQL generation attempts and execution status';
COMMENT ON COLUMN public.sql_logs.state IS 'DRAFT: SQL generated but not executed, FAILED: generation failed, SUCCESS: SQL executed successfully';
COMMENT ON COLUMN public.sql_logs.parent_log_id IS 'References the original log if this is a repair attempt';
COMMENT ON COLUMN public.sql_logs.executed_at IS 'Timestamp when the SQL was marked as successfully executed (state changed to SUCCESS)';
