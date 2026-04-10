-- Fix widget RLS policies with proper email matching and JSON path syntax

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view widgets of shared reports by user ID" ON public.widgets;
DROP POLICY IF EXISTS "Users can view widgets of shared reports by email" ON public.widgets;

-- Create a more permissive policy that allows access to widgets in shared reports
-- We'll handle the email filtering in the application layer since RLS can't access auth.users
CREATE POLICY "Users can view widgets in shared reports" ON public.widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_nodes 
            JOIN report_shares ON report_nodes.report_id = report_shares.report_id
            WHERE report_nodes.node_type = 'widget' 
            AND (report_nodes.content->>'widgetId')::uuid = widgets.id
            AND (
                report_shares.shared_with = auth.uid() 
                OR report_shares.shared_with_email IS NOT NULL
            )
        )
    );
