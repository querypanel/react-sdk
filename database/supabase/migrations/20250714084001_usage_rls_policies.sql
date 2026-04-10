-- RLS policies for all operations on the usage table

-- Allow users to insert their own or their org's usage
CREATE POLICY "User can insert their usage" ON usage
  FOR INSERT
  WITH CHECK (
    (user_id = auth.uid()) OR
    (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  );

-- Allow users to update their own or their org's usage
CREATE POLICY "User can update their usage" ON usage
  FOR UPDATE
  USING (
    (user_id = auth.uid()) OR
    (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    (user_id = auth.uid()) OR
    (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  );

-- Allow users to delete their own or their org's usage
CREATE POLICY "User can delete their usage" ON usage
  FOR DELETE
  USING (
    (user_id = auth.uid()) OR
    (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  ); 