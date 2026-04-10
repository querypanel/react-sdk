"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

export type OrgIdResolutionResult =
  | { organizationId: string; source: "explicit" | "fallback" }
  | { organizationId: null; source: "explicit" | "fallback" };

function parseOrgIdFromRequest(request: NextRequest): string | null {
  const headerId = request.headers.get("x-organization-id");
  if (headerId && headerId.trim().length > 0) return headerId.trim();

  const qsId = request.nextUrl.searchParams.get("organization_id");
  if (qsId && qsId.trim().length > 0) return qsId.trim();

  const qsOrgId = request.nextUrl.searchParams.get("org_id");
  if (qsOrgId && qsOrgId.trim().length > 0) return qsOrgId.trim();

  return null;
}

async function userHasOrgAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase.from("organizations").select("id").eq("id", orgId).eq("owner_id", userId).limit(1),
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .not("joined_at", "is", null)
      .limit(1),
  ]);

  return Boolean(owned?.[0]?.id || member?.[0]?.organization_id);
}

async function fallbackFirstAccessibleOrgId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data: memberOrgs } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .not("joined_at", "is", null)
    .limit(1);

  const memberOrgId = memberOrgs?.[0]?.organization_id ?? null;
  if (memberOrgId) return memberOrgId;

  const { data: ownedOrgs } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);

  return ownedOrgs?.[0]?.id ?? null;
}

/**
 * Resolve an organization id for a request:
 * - If request provides one (header/query), validate access and return it (source=explicit).
 * - Else, return first accessible org (source=fallback) for backward compatibility.
 */
export async function resolveOrganizationIdForRequest(
  request: NextRequest,
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<OrgIdResolutionResult> {
  const requested = parseOrgIdFromRequest(request);
  if (requested) {
    const ok = await userHasOrgAccess(supabase, userId, requested);
    return ok ? { organizationId: requested, source: "explicit" } : { organizationId: null, source: "explicit" };
  }

  const fallback = await fallbackFirstAccessibleOrgId(supabase, userId);
  return fallback ? { organizationId: fallback, source: "fallback" } : { organizationId: null, source: "fallback" };
}

