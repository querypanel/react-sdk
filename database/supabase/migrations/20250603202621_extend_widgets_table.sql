-- Extend Widgets table with advanced management features
ALTER TABLE public.widgets
ADD COLUMN labels TEXT[] DEFAULT '{}',
ADD COLUMN is_private BOOLEAN DEFAULT true,
ADD COLUMN refresh_rate INTEGER DEFAULT NULL; -- in minutes, NULL means no auto-refresh

-- Add index for better search performance on labels
CREATE INDEX idx_widgets_labels ON public.widgets USING GIN(labels);

-- Add index for filtering by privacy setting
CREATE INDEX idx_widgets_is_private ON public.widgets(is_private);

-- Add index for refresh rate filtering
CREATE INDEX idx_widgets_refresh_rate ON public.widgets(refresh_rate);

-- Add comments for documentation
COMMENT ON COLUMN public.widgets.labels IS 'Array of text labels for categorizing and searching widgets';
COMMENT ON COLUMN public.widgets.is_private IS 'Whether the widget is private (true) or public/shareable (false)';
COMMENT ON COLUMN public.widgets.refresh_rate IS 'Auto-refresh interval in minutes, NULL means no auto-refresh'; 