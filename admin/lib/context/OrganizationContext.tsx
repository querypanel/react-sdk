"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

export type OrganizationRole = "owner" | "admin" | "member";

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
  owner_id: string | null;
  created_at: string | null;
  plan_id: number | null;
}

interface OrganizationApiResponse {
  organizations: OrganizationSummary[];
}

interface OrganizationContextValue {
  organizations: OrganizationSummary[];
  loading: boolean;
  error: string | null;
  currentOrganizationId: string | null;
  currentOrganization: OrganizationSummary | null;
  setCurrentOrganizationId: (orgId: string) => void;
  refreshOrganizations: () => Promise<unknown>;
  maxOrganizations: number;
  canCreateOrganization: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "qp_selected_organization_id";
const MAX_ORGANIZATIONS_PER_USER = 5;

function readSelectedOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeSelectedOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!orgId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // ignore
  }
}

async function fetchOrganizationsApi(): Promise<OrganizationSummary[]> {
  const res = await fetch("/api/organizations", { method: "GET" });
  const data: unknown = await res.json();
  if (!res.ok) {
    const errMsg =
      typeof (data as { error?: unknown } | null)?.error === "string"
        ? (data as { error: string }).error
        : "Failed to load organizations";
    throw new Error(errMsg);
  }
  const typed = data as OrganizationApiResponse;
  return Array.isArray(typed.organizations) ? typed.organizations : [];
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [currentOrganizationId, setCurrentOrganizationIdState] = useState<
    string | null
  >(null);

  const {
    data: organizations = [],
    isPending: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizationsApi,
  });

  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? String(queryError)
        : null;

  // initialize selection from localStorage once on mount
  useEffect(() => {
    const saved = readSelectedOrgId();
    if (saved) setCurrentOrganizationIdState(saved);
  }, []);

  // reconcile selection when organizations change
  useEffect(() => {
    if (loading) return;

    if (organizations.length === 0) {
      if (currentOrganizationId !== null) {
        setCurrentOrganizationIdState(null);
        writeSelectedOrgId(null);
      }
      return;
    }

    const exists = currentOrganizationId
      ? organizations.some((o) => o.id === currentOrganizationId)
      : false;

    if (!exists) {
      const nextId = organizations[0]?.id ?? null;
      setCurrentOrganizationIdState(nextId);
      writeSelectedOrgId(nextId);
    }
  }, [currentOrganizationId, loading, organizations]);

  const setCurrentOrganizationId = useCallback((orgId: string) => {
    if (!orgId) return;
    setCurrentOrganizationIdState(orgId);
    writeSelectedOrgId(orgId);
  }, []);

  const currentOrganization = useMemo(() => {
    if (!currentOrganizationId) return null;
    return organizations.find((o) => o.id === currentOrganizationId) ?? null;
  }, [currentOrganizationId, organizations]);

  const value: OrganizationContextValue = useMemo(
    () => ({
      organizations,
      loading,
      error,
      currentOrganizationId,
      currentOrganization,
      setCurrentOrganizationId,
      refreshOrganizations: refetch,
      maxOrganizations: MAX_ORGANIZATIONS_PER_USER,
      canCreateOrganization: organizations.length < MAX_ORGANIZATIONS_PER_USER,
    }),
    [
      organizations,
      loading,
      error,
      currentOrganizationId,
      currentOrganization,
      setCurrentOrganizationId,
      refetch,
    ],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error(
      "useOrganizationContext must be used within an OrganizationProvider",
    );
  }
  return ctx;
}
