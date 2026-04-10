-- Fix widgets RLS policy to allow unauthenticated access to widgets in public shared reports
-- The current policy blocks access because it requires auth.uid() to be set

-- Drop the current restrictive policy
DROP POLICY IF EXISTS "Users can view widgets in shared reports" ON public.widgets;

-- Create a new policy that allows access to widgets in shared reports for both authenticated and unauthenticated users
CREATE POLICY "Users can view widgets in shared reports" ON public.widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_nodes 
            JOIN reports ON report_nodes.report_id = reports.id
            WHERE report_nodes.node_type = 'widget' 
            AND (report_nodes.content->>'widgetId')::uuid = widgets.id
            AND (
                -- Allow access to widgets in public reports (most permissive)
                reports.is_public = true
                -- OR allow authenticated users to see widgets in reports shared with them
                OR (auth.uid() IS NOT NULL AND EXISTS (
                    SELECT 1 FROM report_shares 
                    WHERE report_id = reports.id 
                    AND shared_with = auth.uid()
                ))
                -- OR allow access to widgets in reports with email-based sharing
                OR EXISTS (
                    SELECT 1 FROM report_shares 
                    WHERE report_id = reports.id 
                    AND shared_with_email IS NOT NULL
                )
            )
        )
    );

-- Add a simple, direct policy for widgets in public reports as a fallback
-- This is more permissive and should definitely work
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

-- Add missing SELECT policies for public reports and nodes
-- These were dropped in previous migrations but are needed for public access

-- Policy for viewing public reports
DROP POLICY IF EXISTS "Users can view public reports" ON reports;
CREATE POLICY "Users can view public reports" ON reports
    FOR SELECT USING (is_public = true);

-- Policy for viewing nodes of public reports
DROP POLICY IF EXISTS "Users can view nodes of public reports" ON report_nodes;
CREATE POLICY "Users can view nodes of public reports" ON report_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reports 
            WHERE reports.id = report_nodes.report_id 
            AND reports.is_public = true
        )
    );

-- Policy for viewing shared reports (needed for authenticated users)
DROP POLICY IF EXISTS "Users can view shared reports" ON reports;
CREATE POLICY "Users can view shared reports" ON reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_shares 
            WHERE report_id = reports.id 
            AND shared_with = auth.uid()
        )
    );

-- Policy for viewing nodes of shared reports (needed for authenticated users)
DROP POLICY IF EXISTS "Users can view nodes of shared reports" ON report_nodes;
CREATE POLICY "Users can view nodes of shared reports" ON report_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM report_shares 
            WHERE report_id = report_nodes.report_id 
            AND shared_with = auth.uid()
        )
    );

-- Policy for viewing own reports
DROP POLICY IF EXISTS "Users can view their own reports" ON reports;
CREATE POLICY "Users can view their own reports" ON reports
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for viewing nodes of own reports
DROP POLICY IF EXISTS "Users can view nodes of their own reports" ON report_nodes;
CREATE POLICY "Users can view nodes of their own reports" ON report_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reports 
            WHERE reports.id = report_nodes.report_id 
            AND reports.user_id = auth.uid()
        )
    );
