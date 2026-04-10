-- Fix RLS policies to wrap auth.uid() / auth.role() in SELECT subqueries for performance

-- sdk_charts
DO $$ BEGIN
  DROP POLICY IF EXISTS "sdk_charts_select" ON sdk_charts;
  DROP POLICY IF EXISTS "sdk_charts_insert" ON sdk_charts;
  DROP POLICY IF EXISTS "sdk_charts_update" ON sdk_charts;
  DROP POLICY IF EXISTS "sdk_charts_delete" ON sdk_charts;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "sdk_charts_select" ON sdk_charts FOR SELECT USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY "sdk_charts_insert" ON sdk_charts FOR INSERT WITH CHECK (
  (SELECT auth.role()) = 'authenticated'
);

CREATE POLICY "sdk_charts_update" ON sdk_charts FOR UPDATE USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY "sdk_charts_delete" ON sdk_charts FOR DELETE USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
    )
  )
);

-- sdk_active_charts
DO $$ BEGIN
  DROP POLICY IF EXISTS "sdk_active_charts_select" ON sdk_active_charts;
  DROP POLICY IF EXISTS "sdk_active_charts_insert" ON sdk_active_charts;
  DROP POLICY IF EXISTS "sdk_active_charts_update" ON sdk_active_charts;
  DROP POLICY IF EXISTS "sdk_active_charts_delete" ON sdk_active_charts;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "sdk_active_charts_select" ON sdk_active_charts FOR SELECT USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY "sdk_active_charts_insert" ON sdk_active_charts FOR INSERT WITH CHECK (
  (SELECT auth.role()) = 'authenticated'
);

CREATE POLICY "sdk_active_charts_update" ON sdk_active_charts FOR UPDATE USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
      OR
      organization_id IN (
        SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY "sdk_active_charts_delete" ON sdk_active_charts FOR DELETE USING (
  user_id = (SELECT auth.uid())::text
  OR (
    organization_id IS NOT NULL AND (
      organization_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
    )
  )
);

-- sdk_usage
DO $$ BEGIN
  DROP POLICY IF EXISTS "sdk_usage_select" ON sdk_usage;
  DROP POLICY IF EXISTS "sdk_usage_insert" ON sdk_usage;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "sdk_usage_select" ON sdk_usage FOR SELECT USING (
  user_id = (SELECT auth.uid())::text
  OR (
    org_id IS NOT NULL AND (
      org_id IN (
        SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())
      )
      OR
      org_id IN (
        SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY "sdk_usage_insert" ON sdk_usage FOR INSERT WITH CHECK (
  (SELECT auth.role()) = 'authenticated'
);

-- organizations (view org and plan)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can view org and plan" ON organizations;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Org members can view org and plan" ON organizations FOR SELECT USING (
  id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  OR owner_id = (SELECT auth.uid())
);

-- public_keys / connector_credentials / vector_training_sessions (org-scoped policies)
DO $$ BEGIN
  DROP POLICY IF EXISTS "public_keys_select" ON public_keys;
  DROP POLICY IF EXISTS "public_keys_modify" ON public_keys;
  DROP POLICY IF EXISTS "connector_credentials_select" ON connector_credentials;
  DROP POLICY IF EXISTS "connector_credentials_modify" ON connector_credentials;
  DROP POLICY IF EXISTS "vector_training_sessions_select" ON vector_training_sessions;
  DROP POLICY IF EXISTS "vector_training_sessions_modify" ON vector_training_sessions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "public_keys_select" ON public_keys FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

-- Split modify into per-action policies to avoid multiple permissive policies for SELECT
CREATE POLICY "public_keys_insert" ON public_keys FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "public_keys_update" ON public_keys FOR UPDATE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "public_keys_delete" ON public_keys FOR DELETE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "connector_credentials_select" ON connector_credentials FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

-- Split modify into per-action policies to avoid multiple permissive policies for SELECT
CREATE POLICY "connector_credentials_insert" ON connector_credentials FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "connector_credentials_update" ON connector_credentials FOR UPDATE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "connector_credentials_delete" ON connector_credentials FOR DELETE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "vector_training_sessions_select" ON vector_training_sessions FOR SELECT USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

-- Split modify into per-action policies to avoid multiple permissive policies for SELECT
CREATE POLICY "vector_training_sessions_insert" ON vector_training_sessions FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "vector_training_sessions_update" ON vector_training_sessions FOR UPDATE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

CREATE POLICY "vector_training_sessions_delete" ON vector_training_sessions FOR DELETE USING (
  (org_id IS NOT NULL AND (
    org_id IN (SELECT id FROM organizations WHERE owner_id = (SELECT auth.uid())) OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = (SELECT auth.uid()))
  ))
);

-- ai_summary_history (user-scoped)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own summary history" ON public.ai_summary_history;
  DROP POLICY IF EXISTS "Users can insert their own summary history" ON public.ai_summary_history;
  DROP POLICY IF EXISTS "Users can update their own summary history" ON public.ai_summary_history;
  DROP POLICY IF EXISTS "Users can delete their own summary history" ON public.ai_summary_history;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Users can view their own summary history" ON public.ai_summary_history
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert their own summary history" ON public.ai_summary_history
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own summary history" ON public.ai_summary_history
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own summary history" ON public.ai_summary_history
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- reports / widgets related policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view widgets in shared reports" ON public.widgets;
  DROP POLICY IF EXISTS "Temporary debug policy - allow all widget access" ON public.widgets;
  DROP POLICY IF EXISTS "Allow access to widgets in public reports" ON public.widgets;
  DROP POLICY IF EXISTS "Users can view public reports" ON reports;
  DROP POLICY IF EXISTS "Users can view shared reports" ON reports;
  DROP POLICY IF EXISTS "Users can view their own reports" ON reports;
  DROP POLICY IF EXISTS "Users can update their own reports" ON reports;
  DROP POLICY IF EXISTS "Users can delete their own reports" ON reports;
  DROP POLICY IF EXISTS "Users can update shared reports with admin/edit permission" ON reports;
  DROP POLICY IF EXISTS "Users can delete shared reports with admin permission" ON reports;
  DROP POLICY IF EXISTS "reports_select" ON reports;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;

-- Drop policies on report_nodes only if the table exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'report_nodes' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "Users can view nodes of public reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can view nodes of shared reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can view nodes of their own reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can insert nodes to their own reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can update nodes of their own reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can delete nodes of their own reports" ON report_nodes;
    DROP POLICY IF EXISTS "Users can insert nodes to shared reports with admin/edit permission" ON report_nodes;
    DROP POLICY IF EXISTS "Users can update nodes of shared reports with admin/edit permission" ON report_nodes;
    DROP POLICY IF EXISTS "Users can delete nodes of shared reports with admin/edit permission" ON report_nodes;
  END IF;
END $$;

-- Create policy on widgets only if dependent tables exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'report_nodes' AND c.relkind = 'r'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'reports' AND c.relkind = 'r'
  ) THEN
    CREATE POLICY "Users can view widgets in shared reports" ON public.widgets
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM report_nodes 
                JOIN reports ON report_nodes.report_id = reports.id
                WHERE report_nodes.node_type = 'widget' 
                AND (report_nodes.content->>'widgetId')::uuid = widgets.id
                AND (
                    reports.is_public = true
                    OR ((SELECT auth.uid()) IS NOT NULL AND EXISTS (
                        SELECT 1 FROM report_shares 
                        WHERE report_id = reports.id 
                        AND shared_with = (SELECT auth.uid())
                    ))
                    OR EXISTS (
                        SELECT 1 FROM report_shares 
                        WHERE report_id = reports.id 
                        AND shared_with_email IS NOT NULL
                    )
                )
            )
        );
  END IF;
END $$;

-- (Removed redundant extra SELECT policy on widgets to avoid multiple permissive policies)

-- Consolidate multiple SELECT policies on reports into a single policy
-- Ensure no duplicate consolidated SELECT policy exists
DO $$ BEGIN
  DROP POLICY IF EXISTS "reports_select" ON reports;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "reports_select" ON reports
    FOR SELECT USING (
        is_public = true OR
        EXISTS (
          SELECT 1 FROM report_shares 
          WHERE report_id = reports.id 
          AND shared_with = (SELECT auth.uid())
        ) OR
        (SELECT auth.uid()) = user_id
    );

-- Consolidate multiple SELECT policies on report_nodes into a single policy
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'report_nodes' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "report_nodes_select" ON report_nodes;
    CREATE POLICY "report_nodes_select" ON report_nodes
        FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM reports 
              WHERE reports.id = report_nodes.report_id 
                AND (
                  reports.is_public = true OR
                  reports.user_id = (SELECT auth.uid()) OR
                  EXISTS (
                    SELECT 1 FROM report_shares 
                    WHERE report_id = report_nodes.report_id 
                      AND shared_with = (SELECT auth.uid())
                  )
                )
            )
        );
  END IF;
END $$;

CREATE POLICY "Users can update their own reports" ON reports
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own reports" ON reports
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update shared reports with admin/edit permission" ON reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND shared_with = (SELECT auth.uid())
      AND permission IN ('admin', 'edit')
    )
  );

CREATE POLICY "Users can delete shared reports with admin permission" ON reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM report_shares 
      WHERE report_id = reports.id 
      AND shared_with = (SELECT auth.uid())
      AND permission = 'admin'
    )
  );

-- report_shares policy from user creation trigger fix
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update shares they received" ON report_shares;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Users can update shares they received" ON report_shares
    FOR UPDATE USING (shared_with = (SELECT auth.uid()));

-- available_mcps and customer_mcps
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow read for all" ON available_mcps;
  DROP POLICY IF EXISTS "Users can read their own customer_mcps" ON customer_mcps;
  DROP POLICY IF EXISTS "Users can insert their own customer_mcps" ON customer_mcps;
  DROP POLICY IF EXISTS "Users can update their own customer_mcps" ON customer_mcps;
  DROP POLICY IF EXISTS "Users can delete their own customer_mcps" ON customer_mcps;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Allow read for all" ON available_mcps
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Users can read their own customer_mcps" ON customer_mcps
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own customer_mcps" ON customer_mcps
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own customer_mcps" ON customer_mcps
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own customer_mcps" ON customer_mcps
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- audit_logs and subscriptions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON audit_logs;
  DROP POLICY IF EXISTS "Only authenticated users can view subscriptions" ON public.subscriptions;
  DROP POLICY IF EXISTS "Only authenticated users can update subscriptions" ON public.subscriptions;
  DROP POLICY IF EXISTS "Users can view all subscriptions" ON public.subscriptions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Authenticated users can view audit logs" ON audit_logs
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

-- Depending on which subscriptions policy exists in your instance, re-create safely
CREATE POLICY "Only authenticated users can view subscriptions" ON public.subscriptions
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Only authenticated users can update subscriptions" ON public.subscriptions
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated');

-- sdk_usage and others already handled above


