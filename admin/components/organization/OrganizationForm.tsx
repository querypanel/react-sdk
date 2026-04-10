"use client";

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackEvent } from '@/lib/analytics/mixpanel';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';

interface OrganizationFormProps {
  onCreated?: (organization: { id: string; name: string }) => void;
}

export default function OrganizationForm({ onCreated }: OrganizationFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputId = useId();
  const { organizations, canCreateOrganization, maxOrganizations, refreshOrganizations } = useOrganizationContext();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateOrganization) {
      setError(`Maximum of ${maxOrganizations} workspaces allowed`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to create workspace');
        return;
      }
      // Track organization creation
      trackEvent("Organization Created", {
        organization_id: data.organization?.id,
        organization_name: trimmedName
      });
      await refreshOrganizations();
      void queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      onCreated?.(data.organization);
      // Refresh the page to show the newly created organization
      router.refresh();
    } catch {
      setError('Failed to create workspace');
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = Math.max(0, maxOrganizations - organizations.length);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={inputId} className="text-sm font-medium">Workspace name</label>
        <Input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc"
          required
        />
      </div>
      {!canCreateOrganization ? (
        <p className="text-sm text-red-600">
          You&apos;ve reached the maximum of {maxOrganizations} workspaces.
        </p>
      ) : remaining <= 1 ? (
        <p className="text-sm text-muted-foreground">
          {remaining === 1 ? 'You can create 1 more workspace.' : 'You cannot create more workspaces.'}
        </p>
      ) : null}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting || !name.trim() || !canCreateOrganization}>
        {submitting ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  );
}


