-- Fix RLS policies to allow admin users to modify shared reports (Version 2)
-- This migration fixes the current RLS policies that are blocking admin users

-- Drop the current problematic policies
DROP POLICY IF EXISTS "Users can update their own reports" ON reports;
DROP POLICY IF EXISTS "Users can delete their own reports" ON reports;
DROP POLICY IF EXISTS "Users can insert nodes to their own reports" ON report_nodes;
DROP POLICY IF EXISTS "Users can update nodes of their own reports" ON report_nodes;
DROP POLICY IF EXISTS "Users can delete nodes of their own reports" ON report_nodes;
DROP POLICY IF EXISTS "Users can update shared reports with admin/edit permission" ON reports;
DROP POLICY IF EXISTS "Users can delete shared reports with admin permission" ON reports;
DROP POLICY IF EXISTS "Users can insert nodes to shared reports with admin/edit permission" ON report_nodes;
DROP POLICY IF EXISTS "Users can update nodes of shared reports with admin/edit permission" ON report_nodes;
DROP POLICY IF EXISTS "Users can delete nodes of shared reports with admin/edit permission" ON report_nodes;

-- Create new, working policies for reports
CREATE POLICY "Users can update their own reports" ON reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" ON reports
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for shared reports (admin and edit permissions)
-- Note: We'll handle email-based sharing in the API layer, not in RLS
CREATE POLICY "Users can update shared reports with admin/edit permission" ON reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND shared_with = auth.uid()
      AND permission IN ('admin', 'edit')
    )
  );

CREATE POLICY "Users can delete shared reports with admin permission" ON reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND shared_with = auth.uid()
      AND permission = 'admin'
    )
  );

-- Create policies for report nodes (owner access)
CREATE POLICY "Users can insert nodes to their own reports" ON report_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update nodes of their own reports" ON report_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete nodes of their own reports" ON report_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reports 
      WHERE reports.id = report_nodes.report_id 
      AND reports.user_id = auth.uid()
    )
  );

-- Create policies for shared report nodes (admin and edit permissions)
-- Note: We'll handle email-based sharing in the API layer, not in RLS
CREATE POLICY "Users can insert nodes to shared reports with admin/edit permission" ON report_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = report_nodes.report_id 
      AND shared_with = auth.uid()
      AND permission IN ('admin', 'edit')
    )
  );

CREATE POLICY "Users can update nodes of shared reports with admin/edit permission" ON report_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = report_nodes.report_id 
      AND shared_with = auth.uid()
      AND permission IN ('admin', 'edit')
    )
  );

CREATE POLICY "Users can delete nodes of shared reports with admin/edit permission" ON report_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = report_nodes.report_id 
      AND shared_with = auth.uid()
      AND permission IN ('admin', 'edit')
    )
  );
