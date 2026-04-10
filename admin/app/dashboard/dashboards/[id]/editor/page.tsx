"use client";

import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, DatabaseIcon } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';
import { trackPageView } from '@/lib/analytics/mixpanel';
import { toast } from 'sonner';
import { DashboardDatasourcesModal } from '@/components/dashboards/DashboardDatasourcesModal';
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

const DashboardAiEditor = dynamic(
  () => import('@querypanel/react-sdk').then((mod) => ({ default: mod.DashboardAiEditor })),
  { ssr: false }
);

type Dashboard = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'deployed';
  content_json: string | null;
  admin_prompt?: string | null; // For backwards compatibility
  dashboard_type?: 'customer' | 'internal' | null;
  available_datasource_ids?: string[] | null;
  tenant_field_name?: string | null;
  tenant_field_by_datasource?: Record<string, string> | null;
};

export default function DashboardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const dashboardId = resolvedParams.id;
  const { isLoading: authLoading } = useAuth();
  const {
    currentOrganizationId,
    loading: organizationsLoading,
    organizations,
  } = useOrganizationContext();
  const { resolvedTheme } = useTheme();
  /** Avoid passing a false darkMode before next-themes hydrates; pairs with react-sdk editor stability. */
  const themeReady = resolvedTheme !== undefined;
  const orgId = currentOrganizationId;
  /** Session from /api/auth/me must resolve before mounting BlockNote (avoids orgId flicker + ProseMirror races). */
  const sessionReady = !authLoading;
  /**
   * Organizations from /api/organizations must resolve, and currentOrganizationId must be reconciled
   * (one frame after load) so we never mount the editor with a stale null org id.
   */
  const organizationsReady =
    !organizationsLoading &&
    (organizations.length === 0 || currentOrganizationId !== null);
  const bootstrapReady = sessionReady && organizationsReady && themeReady;
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [initialContent, setInitialContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datasourcesModalOpen, setDatasourcesModalOpen] = useState(false);

  useEffect(() => {
    trackPageView('Dashboard Block Editor Page');
  }, []);

  const fetchDashboard = useCallback(async () => {
    if (!orgId || !dashboardId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboards/${dashboardId}`, {
        headers: { 'x-organization-id': orgId },
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard');
      }

      const data = await response.json();
      setDashboard(data);
      
      // Load content from content_json field (or admin_prompt for backwards compatibility)
      if (data.content_json) {
        setInitialContent(data.content_json);
      } else if (data.admin_prompt) {
        setInitialContent(data.admin_prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, dashboardId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleSave = async (
    content: string,
    options?: { deploy?: boolean }
  ) => {
    if (!orgId || !dashboardId) return;

    try {
      const payload: Record<string, unknown> = {
        content_json: content, // Store BlockNote content in content_json
      };
      if (options?.deploy) {
        payload.status = 'deployed';
        payload.deployed_at = new Date().toISOString();
      }

      const response = await fetch(`/api/dashboards/${dashboardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save dashboard');
      }

      toast.success(options?.deploy ? 'Dashboard deployed successfully' : 'Dashboard saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save dashboard');
    }
  };

  if (!bootstrapReady || isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Dashboard not found</p>
        <Button asChild className="mt-4">
          <a href="/dashboard/dashboards">Back to Dashboards</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-0 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="shrink-0"
          >
            <a href="/dashboard/dashboards">
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Back
            </a>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{dashboard?.name}</h1>
            {dashboard?.description && (
              <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <DashboardAiEditor
        initialContent={initialContent}
        onSave={handleSave}
        organizationId={orgId || undefined}
        dashboardId={dashboardId}
        dashboardType={dashboard.dashboard_type ?? 'customer'}
        showDeployButton={true}
        generateChartWithSqlUrl="/api/agents/sql-agent/stream"
        runSqlUrl="/api/dashboards/run-sql"
        darkMode={resolvedTheme === 'dark'}
        tenantFieldName={dashboard.tenant_field_name ?? undefined}
        tenantFieldByDatasource={dashboard.tenant_field_by_datasource ?? undefined}
        toolbarExtra={
          <Button
            type="button"
            variant="outline"
            onClick={() => setDatasourcesModalOpen(true)}
            className="gap-2 rounded-lg"
          >
            <DatabaseIcon className="w-4 h-4" />
            Datasources & tenant
          </Button>
        }
      />
      <DashboardDatasourcesModal
        open={datasourcesModalOpen}
        onOpenChange={setDatasourcesModalOpen}
        dashboardId={dashboardId}
        organizationId={orgId ?? ''}
        initialAvailableDatasourceIds={dashboard.available_datasource_ids ?? null}
        initialTenantFieldName={dashboard.tenant_field_name ?? null}
        initialTenantFieldByDatasource={dashboard.tenant_field_by_datasource ?? null}
        onSaved={(availableDatasourceIds, tenantFieldName, tenantFieldByDatasource) => {
          setDashboard((prev) =>
            prev
              ? {
                  ...prev,
                  available_datasource_ids: availableDatasourceIds ?? null,
                  tenant_field_name: tenantFieldName ?? null,
                  tenant_field_by_datasource: tenantFieldByDatasource ?? null,
                }
              : null
          );
        }}
      />
    </div>
  );
}
