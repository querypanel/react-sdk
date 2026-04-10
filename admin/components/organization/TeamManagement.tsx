"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Shield, UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics/mixpanel";
import { useOrganizationContext } from "@/lib/context/OrganizationContext";

type Member = {
  user_id: string;
  email: string | null;
  role: "member" | "admin" | "owner";
  joined_at: string | null;
};

type MembersApiResponse = {
  members?: Member[];
  currentRole?: Member["role"];
  collaboratorsLimit?: number;
  error?: string;
};

const MEMBERS_QUERY_KEY = "organization-members";

async function fetchMembersApi(orgId: string): Promise<{
  members: Member[];
  currentRole: Member["role"];
  collaboratorsLimit: number | null;
}> {
  const res = await fetch("/api/organizations/members", {
    headers: { "x-organization-id": orgId },
  });
  const data = (await res.json()) as MembersApiResponse;
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load members");
  }
  return {
    members: data.members || [],
    currentRole: data.currentRole ?? "member",
    collaboratorsLimit:
      typeof data.collaboratorsLimit === "number"
        ? data.collaboratorsLimit
        : null,
  };
}

export default function TeamManagement() {
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganizationContext();
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("member");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const emailId = useId();
  const roleId = useId();

  const {
    data,
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: [MEMBERS_QUERY_KEY, currentOrganizationId],
    queryFn: () => {
      if (!currentOrganizationId) {
        throw new Error("No organization selected");
      }
      return fetchMembersApi(currentOrganizationId);
    },
    enabled: Boolean(currentOrganizationId),
  });

  const members = data?.members ?? [];
  const currentRole = data?.currentRole ?? "member";
  const collaboratorsLimit = data?.collaboratorsLimit ?? null;

  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: [MEMBERS_QUERY_KEY, currentOrganizationId] });

  const displayError =
    actionError ??
    (queryError instanceof Error ? queryError.message : null);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setActionError(null);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentOrganizationId ? { "x-organization-id": currentOrganizationId } : {}),
        },
        body: JSON.stringify({ email, role }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData?.error || "Failed to add member");
      trackEvent("Member Invited", {
        member_email: email,
        member_role: role,
      });
      setEmail("");
      setRole("member");
      await invalidateMembers();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to add member",
      );
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (userId: string, newRole: Member["role"]) => {
    try {
      const res = await fetch(`/api/organizations/members/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(currentOrganizationId ? { "x-organization-id": currentOrganizationId } : {}),
        },
        body: JSON.stringify({ role: newRole }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(resData?.error || "Failed to change role");
      trackEvent("Member Role Changed", {
        member_id: userId,
        new_role: newRole,
      });
      await invalidateMembers();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to change role",
      );
    }
  };

  const removeMember = async (userId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/organizations/members/${userId}`, {
        method: "DELETE",
        headers: currentOrganizationId
          ? { "x-organization-id": currentOrganizationId }
          : undefined,
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(resData?.error || "Failed to remove member");
      trackEvent("Member Removed", {
        member_id: userId,
      });
      await invalidateMembers();
      return true;
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to remove member",
      );
      return false;
    }
  };

  const confirmRemove = (member: Member) => {
    setRemoveTarget(member);
    setRemoveOpen(true);
  };
  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const ok = await removeMember(removeTarget.user_id);
    setRemoving(false);
    if (ok) {
      setRemoveOpen(false);
      setRemoveTarget(null);
    }
  };

  const atLimit =
    collaboratorsLimit !== null && members.length >= collaboratorsLimit;

  return (
    <Card className="border-indigo-200 dark:border-indigo-800">
      <CardContent className="pt-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Team</h3>
          <Shield className="w-4 h-4 text-indigo-600" />
        </div>

        {atLimit ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300 px-4 py-3 text-sm">
            You’ve reached your plan’s collaborator limit ({collaboratorsLimit}).
            Upgrade to add more collaborators.
          </div>
        ) : null}

        <form
          onSubmit={addMember}
          className="grid grid-cols-1 sm:grid-cols-5 gap-3"
        >
          <div className="sm:col-span-3 space-y-1">
            <Label htmlFor={emailId}>Invite by email</Label>
            <Input
              id={emailId}
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={currentRole === "member" || atLimit}
            />
          </div>
          <div className="sm:col-span-1 space-y-1">
            <Label htmlFor={roleId}>Role</Label>
            <select
              id={roleId}
              className="w-full h-10 rounded-md border bg-background px-3"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as Member["role"])
              }
              disabled={currentRole === "member" || atLimit}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner" disabled={currentRole !== "owner"}>
                Owner
              </option>
            </select>
          </div>
          <div className="sm:col-span-1 flex items-end">
            <Button
              type="submit"
              disabled={
                adding || currentRole === "member" || atLimit
              }
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span className="ml-2">Add</span>
            </Button>
          </div>
        </form>

        {displayError ? (
          <p className="text-sm text-red-600">{displayError}</p>
        ) : null}

        <div className="border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No members yet
            </div>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{m.email || m.user_id}</div>
                    <div className="text-xs text-muted-foreground">
                      Joined{" "}
                      {m.joined_at
                        ? new Date(m.joined_at).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="h-9 min-w-[9rem] rounded-md border bg-background px-2"
                      value={m.role}
                      onChange={(e) =>
                        changeRole(m.user_id, e.target.value as Member["role"])
                      }
                      disabled={
                        currentRole === "member" ||
                        (currentRole === "admin" && m.role === "owner")
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option
                        value="owner"
                        disabled={currentRole !== "owner"}
                      >
                        Owner
                      </option>
                    </select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => confirmRemove(m)}
                      disabled={
                        currentRole === "member" ||
                        (currentRole === "admin" && m.role !== "member")
                      }
                      className="border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove member</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">
              {removeTarget ? (
                <>
                  Are you sure you want to remove{" "}
                  <span className="font-medium text-foreground">
                    {removeTarget.email || removeTarget.user_id}
                  </span>{" "}
                  from this workspace?
                </>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRemoveOpen(false)}
                disabled={removing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRemove}
                disabled={removing}
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700"
              >
                {removing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                <span className={removing ? "ml-2" : ""}>
                  {removing ? "Removing…" : "Remove"}
                </span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
