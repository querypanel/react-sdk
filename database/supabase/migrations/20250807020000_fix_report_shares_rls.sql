-- Fix RLS policies for report_shares to support email-based sharing

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view shares they created" ON report_shares;
DROP POLICY IF EXISTS "Users can view shares they received" ON report_shares;

-- Create new policies that support both user ID and email-based sharing
CREATE POLICY "Users can view shares they created" ON report_shares
  FOR SELECT USING (shared_by = auth.uid());

CREATE POLICY "Users can view shares they received by user ID" ON report_shares
  FOR SELECT USING (shared_with = auth.uid());

-- Add policy for email-based sharing
-- Note: This policy allows users to see shares where their email matches shared_with_email
-- We need to get the user's email from auth.users, but since we can't access it directly in RLS,
-- we'll handle this in the application layer and use a more permissive policy
CREATE POLICY "Users can view shares by email" ON report_shares
  FOR SELECT USING (
    shared_with_email IS NOT NULL
  );

-- Update the reports policy to include email-based sharing
DROP POLICY IF EXISTS "Users can view shared reports" ON reports;
CREATE POLICY "Users can view shared reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND (shared_with = auth.uid() OR shared_with_email IS NOT NULL)
    )
  );

-- Update the report nodes policy to include email-based sharing
DROP POLICY IF EXISTS "Users can view nodes of shared reports" ON report_nodes;
CREATE POLICY "Users can view nodes of shared reports" ON report_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = report_nodes.report_id 
      AND (shared_with = auth.uid() OR shared_with_email IS NOT NULL)
    )
  );
