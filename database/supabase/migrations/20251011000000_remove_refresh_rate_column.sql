-- Remove refresh_rate column from widgets table
ALTER TABLE public.widgets DROP COLUMN IF EXISTS refresh_rate;

-- Drop the index for refresh rate filtering
DROP INDEX IF EXISTS idx_widgets_refresh_rate;
