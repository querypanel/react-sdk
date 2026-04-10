"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatabaseIcon, PlusIcon, ServerIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';
import { trackEvent, trackPageView } from '@/lib/analytics/mixpanel';
import { DatasourceForm, type DatasourceFormState } from '@/components/datasources/DatasourceForm';

type DatasourceListItem = {
  id: string;
  name: string;
  dialect: 'postgres' | 'clickhouse' | 'bigquery';
  host: string | null;
  port: number | null;
  database_name: string;
  username: string | null;
  ssl_mode: string | null;
  use_iam_auth: boolean | null;
  aws_region: string | null;
  aws_role_arn: string | null;
  bigquery_project_id: string | null;
  bigquery_dataset_project_id: string | null;
  bigquery_location: string | null;
  bigquery_meta: {
    authMode?: 'google_oauth';
    oauth?: {
      subjectEmail?: string;
      expiresAt?: string;
    };
  } | null;
  tenant_field_name: string | null;
  tenant_field_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  has_password: boolean;
  has_credentials: boolean;
};

const blankForm: DatasourceFormState = {
  name: '',
  dialect: 'postgres',
  host: '',
  port: '5432',
  database_name: '',
  username: '',
  password: '',
  bigquery_project_id: '',
  bigquery_dataset_project_id: '',
  bigquery_location: 'US',
  bigquery_auth_mode: 'google_oauth',
  ssl_mode: 'require',
  use_iam_auth: false,
  aws_region: '',
  aws_role_arn: '',
  tenant_field_name: '',
  tenant_field_type: 'String',
};

export default function DatasourcesPage() {
  const { currentOrganizationId, loading: orgLoading } = useOrganizationContext();
  const orgId = currentOrganizationId;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [datasources, setDatasources] = useState<DatasourceListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formState, setFormState] = useState<DatasourceFormState>(blankForm);
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [bigQueryOAuthStatus, setBigQueryOAuthStatus] = useState<{
    connected: boolean;
    expired: boolean;
    subjectEmail: string | null;
    scopes: string[];
    expiresAt: string | null;
    authMode: 'google_oauth';
  } | null>(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [oauthBanner, setOauthBanner] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    trackPageView('Datasource Manager Page');
  }, []);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;
    const datasourceId = searchParams.get('datasourceId');
    const oauthMessage = searchParams.get('oauthMessage');

    if (datasourceId) {
      setSelectedId(datasourceId);
      setIsCreating(false);
    }

    if (oauth === 'success') {
      setOauthBanner({
        kind: 'success',
        message:
          'Google OAuth completed and tokens were received. Review datasource fields and click Save to persist your datasource configuration.',
      });
    } else if (oauth === 'error') {
      setOauthBanner({
        kind: 'error',
        message: `Google OAuth failed${oauthMessage ? `: ${oauthMessage}` : ''}`,
      });
    }

    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete('oauth');
    cleaned.delete('datasourceId');
    cleaned.delete('oauthMessage');
    const next = cleaned.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const resetForm = useCallback(() => {
    setFormState(blankForm);
    setHasPassword(false);
  }, []);

  const fetchDatasources = useCallback(async () => {
    if (!orgId) {
      setDatasources([]);
      setSelectedId(null);
      resetForm();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/datasources', {
        headers: { 'x-organization-id': orgId },
      });
      if (!response.ok) {
        throw new Error('Failed to load datasources');
      }
      const data = await response.json();
      const list = (data.datasources || []) as DatasourceListItem[];
      setDatasources(list);
      if (list.length > 0) {
        setSelectedId((prev) => prev && list.some((item) => item.id === prev) ? prev : list[0].id);
      } else {
        setSelectedId(null);
        setIsCreating(true);
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasources');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, resetForm]);

  useEffect(() => {
    fetchDatasources();
  }, [fetchDatasources]);

  const selectedDatasource = useMemo(
    () => datasources.find((item) => item.id === selectedId) ?? null,
    [datasources, selectedId]
  );

  useEffect(() => {
    if (!selectedDatasource) return;
    setIsCreating(false);
    setFormState({
      name: selectedDatasource.name,
      dialect: selectedDatasource.dialect,
      host: selectedDatasource.host ?? '',
      port: String(selectedDatasource.port ?? ''),
      database_name: selectedDatasource.database_name,
      username: selectedDatasource.username ?? '',
      password: '',
      bigquery_project_id: selectedDatasource.bigquery_project_id ?? '',
      bigquery_dataset_project_id: selectedDatasource.bigquery_dataset_project_id ?? '',
      bigquery_location: selectedDatasource.bigquery_location ?? 'US',
      bigquery_auth_mode: 'google_oauth',
      ssl_mode: selectedDatasource.ssl_mode ?? 'require',
      use_iam_auth: Boolean(selectedDatasource.use_iam_auth),
      aws_region: selectedDatasource.aws_region ?? '',
      aws_role_arn: selectedDatasource.aws_role_arn ?? '',
      tenant_field_name: selectedDatasource.tenant_field_name ?? '',
      tenant_field_type: (selectedDatasource.tenant_field_type as DatasourceFormState['tenant_field_type']) ?? 'String',
    });
    setHasPassword(selectedDatasource.has_credentials);
  }, [selectedDatasource]);

  useEffect(() => {
    const fetchOAuthStatus = async () => {
      if (!orgId || !selectedDatasource || selectedDatasource.dialect !== 'bigquery') {
        setBigQueryOAuthStatus(null);
        return;
      }
      setIsOAuthLoading(true);
      try {
        const response = await fetch(`/api/datasources/${selectedDatasource.id}/oauth/bigquery/status`, {
          headers: { 'x-organization-id': orgId },
        });
        if (!response.ok) {
          setBigQueryOAuthStatus(null);
          return;
        }
        const data = await response.json();
        setBigQueryOAuthStatus(data);
        if (data?.connected && data?.authMode === 'google_oauth') {
          setFormState((prev) => {
            if (prev.dialect !== 'bigquery') {
              return prev;
            }
            return {
              ...prev,
              bigquery_auth_mode: 'google_oauth',
            };
          });
        }
      } catch {
        setBigQueryOAuthStatus(null);
      } finally {
        setIsOAuthLoading(false);
      }
    };
    fetchOAuthStatus();
  }, [orgId, selectedDatasource]);

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    resetForm();
    setError(null);
    setSuccess(null);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsCreating(false);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setError(null);
    setSuccess(null);
    if (!formState.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formState.database_name.trim()) {
      setError(formState.dialect === 'bigquery' ? 'Dataset is required' : 'Database name is required');
      return;
    }
    if (formState.dialect === 'bigquery') {
      if (!formState.bigquery_project_id.trim()) {
        setError('Project ID is required');
        return;
      }
    } else {
      if (!formState.host.trim()) {
        setError('Host is required');
        return;
      }
      if (!formState.port.trim() || Number.isNaN(Number(formState.port))) {
        setError('Valid port is required');
        return;
      }
      if (!formState.username.trim()) {
        setError('Username is required');
        return;
      }
      if (!formState.use_iam_auth && isCreating && !formState.password) {
        setError('Password is required');
        return;
      }
    }

    if (formState.dialect !== 'postgres' && formState.use_iam_auth) {
      setError('AWS IAM auth is only supported for Postgres');
      return;
    }

    setIsSaving(true);
    try {
      const effectiveBigQueryAuthMode = 'google_oauth';

      const payload: Record<string, unknown> = {
        name: formState.name.trim(),
        dialect: formState.dialect,
        database_name: formState.database_name.trim(),
        host: formState.dialect === 'bigquery' ? null : formState.host.trim(),
        port: formState.dialect === 'bigquery' ? null : Number(formState.port),
        username: formState.dialect === 'bigquery' ? null : formState.username.trim(),
        ssl_mode: formState.dialect === 'bigquery' ? null : formState.ssl_mode,
        use_iam_auth: formState.dialect === 'postgres' ? formState.use_iam_auth : false,
        aws_region: formState.dialect === 'postgres' && formState.use_iam_auth ? formState.aws_region.trim() || null : null,
        aws_role_arn: formState.dialect === 'postgres' && formState.use_iam_auth ? formState.aws_role_arn.trim() || null : null,
        bigquery_project_id: formState.dialect === 'bigquery' ? formState.bigquery_project_id.trim() : null,
        bigquery_dataset_project_id: formState.dialect === 'bigquery' ? formState.bigquery_dataset_project_id.trim() || null : null,
        bigquery_location: formState.dialect === 'bigquery' ? formState.bigquery_location.trim() || null : null,
        bigquery_meta:
          formState.dialect === 'bigquery'
            ? {
                authMode: effectiveBigQueryAuthMode,
                projectId: formState.bigquery_project_id.trim(),
                datasetProjectId: formState.bigquery_dataset_project_id.trim() || undefined,
                location: formState.bigquery_location.trim() || undefined,
              }
            : null,
        tenant_field_name: formState.tenant_field_name.trim() || null,
        tenant_field_type: formState.tenant_field_type,
      };

      if (formState.dialect !== 'bigquery' && formState.password) {
        payload.password = formState.password;
      }
      const response = await fetch(
        isCreating ? '/api/datasources' : `/api/datasources/${selectedId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to save datasource');
      }

      trackEvent(isCreating ? 'Datasource Created' : 'Datasource Updated', {
        dialect: formState.dialect,
      });

      setSuccess(isCreating ? 'Datasource created' : 'Datasource updated');
      await fetchDatasources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save datasource');
    } finally {
      setIsSaving(false);
      setFormState((prev) => ({ ...prev, password: '' }));
    }
  };

  const handleConnectGoogleOAuth = async () => {
    if (!orgId || !selectedId) {
      setError('Create the datasource first, then connect Google OAuth.');
      return;
    }
    setIsOAuthLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/datasources/${selectedId}/oauth/bigquery/start`, {
        method: 'POST',
        headers: { 'x-organization-id': orgId },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data?.error || 'Failed to start Google OAuth');
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google OAuth');
      setIsOAuthLoading(false);
    }
  };

  const handleDisconnectGoogleOAuth = async () => {
    if (!orgId || !selectedId) return;
    setIsOAuthLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/datasources/${selectedId}/oauth/bigquery/disconnect`, {
        method: 'POST',
        headers: { 'x-organization-id': orgId },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to disconnect Google OAuth');
      }
      setSuccess('Google OAuth disconnected');
      setBigQueryOAuthStatus((prev) =>
        prev
          ? {
              ...prev,
              connected: false,
              expired: false,
              subjectEmail: null,
              expiresAt: null,
              scopes: [],
            }
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google OAuth');
    } finally {
      setIsOAuthLoading(false);
    }
  };

  const handleTest = async () => {
    if (!orgId || !selectedId) return;
    setIsTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/datasources/${selectedId}/test`, {
        method: 'POST',
        headers: { 'x-organization-id': orgId },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Connection test failed');
      }
      trackEvent('Datasource Tested', { id: selectedId });
      setSuccess('Connection successful');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId || !selectedId) return;
    if (!window.confirm('Delete this datasource? This cannot be undone.')) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/datasources/${selectedId}`, {
        method: 'DELETE',
        headers: { 'x-organization-id': orgId },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete datasource');
      }
      trackEvent('Datasource Deleted', { id: selectedId });
      setSuccess('Datasource deleted');
      await fetchDatasources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete datasource');
    } finally {
      setIsSaving(false);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <DatabaseIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Datasources
            </h1>
            <p className="text-muted-foreground">Connect your data stores</p>
          </div>
        </div>
        <Card className="relative overflow-hidden border-purple-200 dark:border-purple-800">
          <CardContent className="pt-12 text-center space-y-4">
            <div className="text-6xl mb-2">🚀</div>
            <h2 className="text-xl font-semibold">Let&apos;s create a workspace</h2>
            <p className="text-muted-foreground">Get started by setting up your workspace first</p>
            <a href="/dashboard/home">
              <Button className="mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
                Go to home
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-6 lg:h-[calc(100vh-8rem)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <ServerIcon className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              Datasource Manager
            </h1>
            <p className="text-muted-foreground">Create and manage database connections</p>
          </div>
        </div>
        <Button
          onClick={handleStartCreate}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 sm:w-auto"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          New datasource
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-950/20 text-green-600 p-3 rounded-lg text-sm">
          {success}
        </div>
      )}
      {oauthBanner && (
        <div
          className={cn(
            'p-3 rounded-lg text-sm border',
            oauthBanner.kind === 'success'
              ? 'bg-green-50 dark:bg-green-950/20 text-green-700 border-green-200 dark:border-green-900'
              : 'bg-red-50 dark:bg-red-950/20 text-red-700 border-red-200 dark:border-red-900'
          )}
        >
          {oauthBanner.message}
        </div>
      )}

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border transition-all duration-300 lg:h-[calc(100%-6rem)] lg:flex-row">
        <div className={cn(
          "flex flex-col bg-background transition-all duration-300 lg:border-r",
          isListCollapsed ? "lg:w-14" : "lg:w-[240px]"
        )}>
          <button
            type="button"
            onClick={() => setIsListCollapsed(!isListCollapsed)}
            className="flex items-center justify-center border-b p-3 transition-colors hover:bg-muted/50"
            title={isListCollapsed ? "Expand datasources" : "Collapse datasources"}
          >
            <ChevronRightIcon className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              !isListCollapsed && "rotate-90 lg:rotate-180"
            )} />
          </button>
          <div
            className={cn(
              "overflow-y-auto transition-all duration-300 lg:flex-1",
              isListCollapsed ? "max-h-0 lg:max-h-none" : "max-h-64 lg:max-h-none"
            )}
          >
            {datasources.length === 0 ? (
              !isListCollapsed && (
                <div className="text-center py-8 text-sm text-muted-foreground px-2">
                  <DatabaseIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No datasources</p>
                </div>
              )
            ) : (
              <div className={cn("p-2", isListCollapsed && "flex flex-col items-center gap-1")}>
                {datasources.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "transition-colors",
                      isListCollapsed
                        ? cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            selectedId === item.id
                              ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                              : "hover:bg-muted text-muted-foreground"
                          )
                        : cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm mb-1",
                            selectedId === item.id
                              ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                              : "hover:bg-muted"
                          )
                    )}
                    title={item.name}
                  >
                    {isListCollapsed ? (
                      <DatabaseIcon className="w-5 h-5" />
                    ) : (
                      <>
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] uppercase">
                            {item.dialect}
                          </span>
                          <span className="truncate">{item.database_name}</span>
                        </div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="overflow-y-auto p-4 sm:p-6">
            {isCreating || selectedDatasource ? (
              <DatasourceForm
                value={formState}
                onChange={(patch) => setFormState((prev) => ({ ...prev, ...patch }))}
                onSave={handleSave}
                onDelete={!isCreating ? handleDelete : undefined}
                onTest={!isCreating ? handleTest : undefined}
                isSaving={isSaving}
                isTesting={isTesting}
                isNew={isCreating}
                hasPassword={hasPassword}
                bigQueryOAuthStatus={bigQueryOAuthStatus}
                isOAuthLoading={isOAuthLoading}
                onConnectGoogleOAuth={formState.dialect === 'bigquery' && formState.bigquery_auth_mode === 'google_oauth' ? handleConnectGoogleOAuth : undefined}
                onDisconnectGoogleOAuth={formState.dialect === 'bigquery' && formState.bigquery_auth_mode === 'google_oauth' ? handleDisconnectGoogleOAuth : undefined}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a datasource to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
