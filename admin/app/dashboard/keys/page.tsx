"use client";

import { KeyIcon, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import JWKSManagement from "@/components/settings/JWKSManagement";
import { useOrganizationContext } from "@/lib/context/OrganizationContext";
import { useAuth } from "@/lib/context/AuthContext";

export default function KeysPage() {
  const {
    currentOrganization,
    loading: orgLoading,
    organizations,
  } = useOrganizationContext();
  const { isLoading: authLoading } = useAuth();

  const waitingForAuthOrOrgs = authLoading || orgLoading;
  const waitingForOrgSelection =
    !orgLoading &&
    organizations.length > 0 &&
    currentOrganization == null;

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
          <KeyIcon className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Keys
          </h1>
          <p className="text-muted-foreground">
            Manage the signing keys used for SDK authentication.
          </p>
        </div>
      </div>

      {waitingForAuthOrOrgs || waitingForOrgSelection ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading workspace…</p>
        </div>
      ) : currentOrganization ? (
        <JWKSManagement orgId={currentOrganization.id} />
      ) : (
        <Card className="relative overflow-hidden border-purple-200 dark:border-purple-800">
          <CardContent className="pt-12 text-center space-y-4">
            <div className="text-6xl mb-2">🔑</div>
            <h2 className="text-xl font-semibold">Create a workspace first</h2>
            <p className="text-muted-foreground">
              Your keys will appear here once you have access to a workspace.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
