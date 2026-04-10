"use client";

import React, { useMemo, useState } from "react";
import { Building2Icon, CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OrganizationForm from "@/components/organization/OrganizationForm";
import { useOrganizationContext, type OrganizationRole } from "@/lib/context/OrganizationContext";

function roleLabel(role: OrganizationRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function OrganizationSwitcher() {
  const router = useRouter();
  const {
    organizations,
    loading,
    error,
    currentOrganizationId,
    currentOrganization,
    setCurrentOrganizationId,
    refreshOrganizations,
    canCreateOrganization,
    maxOrganizations,
  } = useOrganizationContext();

  const [createOpen, setCreateOpen] = useState(false);

  const sortedOrganizations = useMemo(() => {
    const copy = [...organizations];
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [organizations]);

  const handleSelect = (orgId: string) => {
    setCurrentOrganizationId(orgId);
    // Ensure any server components / cached data revalidate where applicable.
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 bg-white/50 dark:bg-gray-900/50 border-purple-200/70 dark:border-purple-800/70 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
          >
            <Building2Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium">
              {loading ? "Loading…" : currentOrganization?.name ?? "No organization"}
            </span>
            <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-purple-200/50 dark:border-purple-800/50"
        >
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
              Organizations
            </p>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <DropdownMenuSeparator />

          <div className="max-h-64 overflow-y-auto">
            {sortedOrganizations.map((org) => {
              const isSelected = org.id === currentOrganizationId;
              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSelect(org.id)}
                  className="flex items-center justify-between p-3 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm font-medium truncate">{org.name}</span>
                    {isSelected && <CheckIcon className="w-4 h-4 text-green-600 shrink-0" />}
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 shrink-0"
                  >
                    {roleLabel(org.role)}
                  </Badge>
                </DropdownMenuItem>
              );
            })}

            {!loading && sortedOrganizations.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">No organizations yet.</div>
            )}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canCreateOrganization}
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 p-3 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium">
              {canCreateOrganization ? "Create organization" : `Org limit reached (${maxOrganizations})`}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
          </DialogHeader>
          <OrganizationForm
            onCreated={async (org) => {
              await refreshOrganizations();
              setCurrentOrganizationId(org.id);
              setCreateOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

