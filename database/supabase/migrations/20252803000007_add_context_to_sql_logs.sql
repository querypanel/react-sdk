-- Add context column to sql_logs table to store retrieved context target identifiers
ALTER TABLE public.sql_logs
  ADD COLUMN context_target_identifiers TEXT[] DEFAULT '{}';

-- Create index for querying by context target identifiers
CREATE INDEX idx_sql_logs_context_target_identifiers
  ON public.sql_logs USING GIN (context_target_identifiers);

-- Add comment
COMMENT ON COLUMN public.sql_logs.context_target_identifiers IS 'Array of target identifiers from the knowledge base that were used as context for SQL generation';
