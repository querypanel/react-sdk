"use client";

import { useCallback, useEffect, useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  LayoutDashboardIcon, 
  PlusIcon, 
  EditIcon,
  TrashIcon,
  CalendarIcon,
  LayersIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';
import { trackEvent, trackPageView } from '@/lib/analytics/mixpanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DashboardListItem = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'deployed';
  datasource_id: string | null;
  admin_prompt: string | null;
  dashboard_type: 'customer' | 'internal' | null;
  version: number;
  deployed_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function DashboardsPage() {
  const { currentOrganizationId, loading: orgLoading } = useOrganizationContext();
  const orgId = currentOrganizationId;
  const nameId = useId();
  const descriptionId = useId();

  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<DashboardListItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<'customer' | 'internal'>('customer');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    trackPageView('Dashboard Manager Page');
  }, []);

  const fetchDashboards = useCallback(async () => {
    if (!orgId) {
      setDashboards([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboards', {
        headers: { 'x-organization-id': orgId },
      });
      if (!response.ok) {
        throw new Error('Failed to load dashboards');
      }
      const data = await response.json();
      setDashboards((data.data || []) as DashboardListItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboards');
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  const handleOpenDialog = (dashboard?: DashboardListItem) => {
    if (dashboard) {
      setEditingDashboard(dashboard);
      setFormName(dashboard.name);
      setFormDescription(dashboard.description || '');
      setFormType(dashboard.dashboard_type ?? 'customer');
    } else {
      setEditingDashboard(null);
      setFormName('');
      setFormDescription('');
      setFormType('customer');
    }
    setIsDialogOpen(true);
    setError(null);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDashboard(null);
    setFormName('');
    setFormDescription('');
    setFormType('customer');
    setError(null);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setError(null);
    if (!formName.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        dashboard_type: formType,
      };

      const response = await fetch(
        editingDashboard ? `/api/dashboards/${editingDashboard.id}` : '/api/dashboards',
        {
          method: editingDashboard ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to save dashboard');
      }

      trackEvent(editingDashboard ? 'Dashboard Updated' : 'Dashboard Created', {
        name: formName,
      });

      setSuccess(editingDashboard ? 'Dashboard updated' : 'Dashboard created');
      await fetchDashboards();
      handleCloseDialog();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dashboard');
    } finally {
      setIsSaving(false);
    }
  };


  const handleDelete = async (dashboard: DashboardListItem) => {
    if (!orgId) return;
    if (!window.confirm('Delete this dashboard? This cannot be undone.')) return;
    
    try {
      const response = await fetch(`/api/dashboards/${dashboard.id}`, {
        method: 'DELETE',
        headers: { 'x-organization-id': orgId },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete dashboard');
      }
      trackEvent('Dashboard Deleted', { id: dashboard.id });
      setSuccess('Dashboard deleted');
      await fetchDashboards();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dashboard');
    }
  };

  const handleOpenEditor = (dashboardId: string) => {
    window.location.href = `/dashboard/dashboards/${dashboardId}/editor`;
  };

  const handleCopyId = async (dashboardId: string) => {
    try {
      await navigator.clipboard.writeText(dashboardId);
      setCopiedId(dashboardId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Failed to copy dashboard ID');
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
            <LayoutDashboardIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Dashboards
            </h1>
            <p className="text-muted-foreground">Create and manage dashboards</p>
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <LayoutDashboardIcon className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              Dashboards
            </h1>
            <p className="text-muted-foreground">Create and manage your dashboards</p>
          </div>
        </div>
        <Button onClick={() => handleOpenDialog()} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 sm:w-auto">
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Dashboard
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

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : dashboards.length === 0 ? (
        <Card className="relative overflow-hidden border-dashed border-2">
          <CardContent className="pt-12 pb-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/20 dark:to-indigo-900/20 flex items-center justify-center">
              <LayoutDashboardIcon className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">No dashboards yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first dashboard to get started
              </p>
              <Button onClick={() => handleOpenDialog()} className="bg-gradient-to-r from-purple-600 to-indigo-600">
                <PlusIcon className="w-4 h-4 mr-2" />
                Create Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboards.map((dashboard) => (
            <Card
              key={dashboard.id}
              className="group hover:shadow-lg transition-all duration-300 hover:scale-[1.02] relative overflow-hidden"
            >
              <CardContent className="p-6">
                <div className="mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/20 dark:to-indigo-900/20 flex items-center justify-center mb-3">
                    <LayersIcon className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 group-hover:text-purple-600 transition-colors">
                    {dashboard.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {dashboard.description || 'No description'}
                  </p>
                </div>

                {/* Dashboard ID Section */}
                <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Dashboard ID</p>
                      <code className="text-xs font-mono text-purple-700 dark:text-purple-300 block truncate">
                        {dashboard.id}
                      </code>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyId(dashboard.id);
                      }}
                      className="shrink-0 h-8 w-8 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                      title="Copy Dashboard ID"
                    >
                      {copiedId === dashboard.id ? (
                        <CheckIcon className="w-4 h-4 text-green-600" />
                      ) : (
                        <CopyIcon className="w-4 h-4 text-purple-600" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <CalendarIcon className="w-3 h-3" />
                  <span>Created {new Date(dashboard.created_at).toLocaleDateString()}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleOpenEditor(dashboard.id)}
                    className="min-w-[9rem] flex-1 bg-gradient-to-r from-purple-600 to-indigo-600"
                  >
                    <EditIcon className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(dashboard);
                    }}
                    title="Edit details"
                  >
                    <EditIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(dashboard);
                    }}
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    title="Delete dashboard"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDashboard ? 'Edit Dashboard' : 'Create Dashboard'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Customer Analytics Dashboard"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={descriptionId}>Description</Label>
              <Textarea
                id={descriptionId}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Overview of customer metrics and trends"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Dashboard Type</Label>
              <Select value={formType} onValueChange={(value) => setFormType(value as 'customer' | 'internal')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select dashboard type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer (tenant-isolated, embeddable)</SelectItem>
                  <SelectItem value="internal">Internal (cross-tenant, admin-only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 text-red-600 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center">
              <Button onClick={handleSave} disabled={isSaving} className="w-full flex-1">
                {isSaving ? 'Saving...' : editingDashboard ? 'Save Changes' : 'Create Dashboard'}
              </Button>
              <Button onClick={handleCloseDialog} variant="outline" className="w-full sm:w-auto">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
