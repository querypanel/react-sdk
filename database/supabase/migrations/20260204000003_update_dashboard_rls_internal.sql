-- Restrict internal dashboards to org admins only

DROP POLICY IF EXISTS "Users can read their organization dashboards"
  ON public.dashboards;

CREATE POLICY "Users can read customer dashboards"
  ON public.dashboards
  FOR SELECT
  TO authenticated
  USING (
    (dashboard_type = 'customer' OR dashboard_type IS NULL)
    AND organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read internal dashboards"
  ON public.dashboards
  FOR SELECT
  TO authenticated
  USING (
    dashboard_type = 'internal'
    AND organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
