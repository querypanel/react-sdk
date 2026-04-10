-- Fix RLS policies for widgets to support report-based sharing

-- Drop existing view policy
DROP POLICY IF EXISTS "Users can view their own widgets" ON public.widgets;

-- Create new policies that support report-based sharing
CREATE POLICY "Users can view their own widgets" ON public.widgets
    FOR SELECT USING (auth.uid() = user_id);

-- Add policy for widgets used in shared reports (via user ID)
CREATE POLICY "Users can view widgets of shared reports by user ID" ON public.widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_nodes 
            JOIN report_shares ON report_nodes.report_id = report_shares.report_id
            WHERE report_nodes.node_type = 'widget' 
            AND report_nodes.content->>'widgetId' = widgets.id::text
            AND report_shares.shared_with = auth.uid()
        )
    );

-- Add policy for widgets used in shared reports (via email)
CREATE POLICY "Users can view widgets of shared reports by email" ON public.widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_nodes 
            JOIN report_shares ON report_nodes.report_id = report_shares.report_id
            WHERE report_nodes.node_type = 'widget' 
            AND report_nodes.content->>'widgetId' = widgets.id::text
            AND report_shares.shared_with_email IS NOT NULL
        )
    );

-- Keep existing policies for insert, update, delete (only own widgets)
-- These don't need to change since users should only be able to modify their own widgets
