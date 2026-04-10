"use client";

import { useMemo, useState } from "react";
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  PlusIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import OrganizationForm from "@/components/organization/OrganizationForm";
import {
  useOrganizationContext,
  type OrganizationRole,
} from "@/lib/context/OrganizationContext";
import { useAuth } from "@/lib/context/AuthContext";

interface UserProfileProps {
  className?: string;
}

function roleLabel(role: OrganizationRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function UserProfile({ className }: UserProfileProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    organizations,
    loading: orgLoading,
    error: orgError,
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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  if (authLoading || orgLoading) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="w-8 h-8 animate-pulse bg-muted rounded"></div>
        <div className="w-24 h-6 animate-pulse bg-muted rounded"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const hasOrganizations = organizations.length > 0;
  const userName = user.email?.split("@")[0] || "User";

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="max-w-[min(52vw,14rem)] sm:max-w-none flex items-center gap-2 bg-gradient-to-r from-purple-100/50 to-indigo-100/50 dark:from-purple-900/30 dark:to-indigo-900/30 border-purple-200/50 dark:border-purple-800/50 hover:bg-purple-100/70 dark:hover:bg-purple-900/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="truncate text-sm font-medium text-purple-700 dark:text-purple-300">
                  {userName}
                </span>
              </div>

              {currentOrganization?.name && (
                <div className="hidden sm:flex items-center gap-1 ml-2 pl-2 border-l border-purple-300/50 dark:border-purple-700/50">
                  <Building2Icon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300 max-w-[140px] truncate">
                    {currentOrganization.name}
                  </span>
                </div>
              )}

              {hasOrganizations && (
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-purple-300/50 dark:border-purple-700/50">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {organizations.length}
                  </span>
                </div>
              )}

              <ChevronDownIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-[min(20rem,calc(100vw-2rem))] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-purple-200/50 dark:border-purple-800/50"
          >
            <div className="px-4 py-3 border-b border-purple-200/50 dark:border-purple-800/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {userName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-purple-200/50 dark:border-purple-800/50">
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                Workspaces ({organizations.length})
              </p>
              {orgError && (
                <p className="text-xs text-red-600 mt-1">{orgError}</p>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto">
              {sortedOrganizations.map((org) => {
                const selected = org.id === currentOrganizationId;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => {
                      setCurrentOrganizationId(org.id);
                      router.refresh();
                    }}
                    className="flex items-center justify-between p-3 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {org.name}
                      </span>
                      {selected && (
                        <CheckIcon className="w-4 h-4 text-green-600 shrink-0" />
                      )}
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

              {!orgLoading && sortedOrganizations.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No workspaces yet.
                </div>
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
                {canCreateOrganization
                  ? "Create workspace"
                  : `Workspace limit reached (${maxOrganizations})`}
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center gap-2 p-3 text-red-600 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-900/30"
            >
              <LogOutIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create workspace</DialogTitle>
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
    </div>
  );
}
