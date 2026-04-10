"use client";

import { useOrganizationContext } from '@/lib/context/OrganizationContext';
import type { OrganizationSummary } from '@/lib/context/OrganizationContext';

interface UseOrganizationsReturn {
  organizations: OrganizationSummary[];
  loading: boolean;
  error: string | null;
  refreshOrganizations: () => Promise<unknown>;
  currentOrganizationId: string | null;
  currentOrganization: OrganizationSummary | null;
  setCurrentOrganizationId: (orgId: string) => void;
  maxOrganizations: number;
  canCreateOrganization: boolean;
}

export function useOrganizations(): UseOrganizationsReturn {
  const ctx = useOrganizationContext();

  return {
    organizations: ctx.organizations,
    loading: ctx.loading,
    error: ctx.error,
    refreshOrganizations: ctx.refreshOrganizations,
    currentOrganizationId: ctx.currentOrganizationId,
    currentOrganization: ctx.currentOrganization,
    setCurrentOrganizationId: ctx.setCurrentOrganizationId,
    maxOrganizations: ctx.maxOrganizations,
    canCreateOrganization: ctx.canCreateOrganization,
  };
}
