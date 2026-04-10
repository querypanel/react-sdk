"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Edit2, Save, X, Building2 } from 'lucide-react';
import { trackEvent } from '@/lib/analytics/mixpanel';

interface OrganizationCardProps {
  organization: { id: string; name: string };
  onUpdated?: (organization: { id: string; name: string }) => void;
}

export default function OrganizationCard({ organization, onUpdated }: OrganizationCardProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const [saving, setSaving] = useState(false);

  const copyId = async () => {
    await navigator.clipboard.writeText(organization.id);
    trackEvent("Organization ID Copied", {
      organization_id: organization.id
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update');
      onUpdated?.(data.organization);
      setEditing(false);
    } catch (error) {
      console.error('Failed to update organization:', error);
      // keep editing state on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="relative overflow-hidden border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/80 to-blue-50/40 dark:from-indigo-950/20 dark:to-blue-950/10">
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Header with icon and title */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold">Your Workspace</p>
                {!editing ? (
                  <h3 className="mt-1 break-words text-2xl font-bold text-foreground">{organization.name}</h3>
                ) : (
                  <input
                    className="mt-1 w-full rounded-lg border-2 border-indigo-300 bg-background px-3 py-1 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-indigo-600"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!editing ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setEditing(true)}
                  className="border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              ) : (
                <>
                  <Button 
                    size="sm" 
                    onClick={save} 
                    disabled={saving || !name.trim()}
                    className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setEditing(false);
                      setName(organization.name);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ID section with copy button */}
          <div className="rounded-xl border border-indigo-100 bg-white p-4 dark:border-indigo-900/30 dark:bg-gray-900/50">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Workspace ID</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-indigo-100 bg-indigo-50 px-3 dark:border-indigo-900/30 dark:bg-indigo-950/30">
                <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400 truncate">{organization.id}</span>
              </div>
              <Button 
                variant="outline"
                onClick={copyId}
                className="h-10 shrink-0 border-indigo-200 px-3 dark:border-indigo-700 dark:hover:bg-indigo-950/30 sm:w-auto hover:bg-indigo-50"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



