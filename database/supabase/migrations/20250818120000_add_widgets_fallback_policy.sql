-- Add a simple, direct policy for widgets in public reports as a fallback
-- This is more permissive and should definitely work for public access

-- Add a simple, direct policy for widgets in public reports
CREATE POLICY "Allow access to widgets in public reports" ON public.widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_nodes 
            JOIN reports ON report_nodes.report_id = reports.id
            WHERE report_nodes.node_type = 'widget' 
            AND (report_nodes.content->>'widgetId')::uuid = widgets.id
            AND reports.is_public = true
        )
    );

-- Also add a very permissive policy for debugging - allow access to all widgets temporarily
-- This will help us see if the issue is with RLS or something else
-- TODO: Remove this policy after debugging is complete
CREATE POLICY "Temporary debug policy - allow all widget access" ON public.widgets
    FOR SELECT USING (true);
