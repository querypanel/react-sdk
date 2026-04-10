"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollTextIcon } from "lucide-react";
import { useOrganizationContext } from "@/lib/context/OrganizationContext";

type QuerySession = {
  id: string;
  session_id: string;
  tenant_id: string | null;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type QuerySessionTurn = {
  id: string;
  session_id: string;
  turn_index: number;
  question: string;
  sql: string | null;
  rationale: string | null;
  row_count: number | null;
  fields: string[] | null;
  error: string | null;
  created_at: string;
};

type AuditSession = QuerySession & { turns: QuerySessionTurn[] };

type Pagination = {
  current_page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
};

export default function AuditLogsView() {
  const { currentOrganizationId, loading: orgLoading } = useOrganizationContext();
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    current_page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);

  const fetchAuditLogs = useCallback(
    async (page = 1) => {
      if (!currentOrganizationId) {
        setSessions([]);
        setNoOrg(true);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        setNoOrg(false);
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "20",
        });
        const res = await fetch(`/api/audit-logs?${params.toString()}`, {
          headers: { "x-organization-id": currentOrganizationId },
        });
        if (!res.ok) {
          if (res.status === 404) {
            const data = await res.json().catch(() => ({}));
            if (data.error === "No organization found") {
              setNoOrg(true);
              return;
            }
          }
          throw new Error("Failed to load audit logs");
        }
        const data = await res.json();
        setSessions(data.sessions || []);
        setPagination(
          data.pagination || {
            current_page: page,
            page_size: 20,
            total_count: 0,
            total_pages: 0,
          }
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    },
    [currentOrganizationId]
  );

  useEffect(() => {
    fetchAuditLogs(1);
  }, [fetchAuditLogs]);

  const canGoPrev = pagination.current_page > 1;
  const canGoNext =
    pagination.total_pages > 0 && pagination.current_page < pagination.total_pages;

  const summary = useMemo(() => {
    const totalTurns = sessions.reduce((acc, session) => acc + session.turns.length, 0);
    return { totalTurns };
  }, [sessions]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg">
          <ScrollTextIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Audit Logs
          </h1>
          <p className="text-muted-foreground">
            Review context-aware query sessions and their turns.
          </p>
        </div>
      </div>

      {orgLoading || loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : noOrg ? (
        <Card className="relative overflow-hidden border-purple-200 dark:border-purple-800">
          <CardContent className="pt-12 text-center space-y-4">
            <div className="text-6xl mb-2">🚀</div>
            <h2 className="text-xl font-semibold">Let&apos;s create a workspace</h2>
            <p className="text-muted-foreground">
              Get started by setting up your workspace, then you can start querying.
            </p>
            <a href="/dashboard/home">
              <Button className="mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
                Go to home
              </Button>
            </a>
          </CardContent>
        </Card>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          <p>{error}</p>
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="pt-12 text-center space-y-2">
            <p className="text-muted-foreground">No audit logs yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary">
                {pagination.total_count} sessions
              </Badge>
              <Badge variant="secondary">
                {summary.totalTurns} turns
              </Badge>
              <Badge variant="outline">
                Page {pagination.current_page} of {pagination.total_pages || 1}
              </Badge>
            </CardContent>
          </Card>

          {sessions.map((session) => (
            <Card key={session.id} className="border-purple-200/60 dark:border-purple-900/50">
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {session.title || "Untitled session"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Session ID: {session.session_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {session.tenant_id && <Badge variant="outline">Tenant {session.tenant_id}</Badge>}
                    {session.user_id && <Badge variant="outline">User {session.user_id}</Badge>}
                    <Badge variant="secondary">
                      Updated {new Date(session.updated_at).toLocaleString()}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  {session.turns.map((turn) => (
                    <div
                      key={turn.id}
                      className="rounded-lg border border-muted bg-muted/30 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Turn #{turn.turn_index}</span>
                        <span>{new Date(turn.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-sm font-medium">Q: {turn.question}</div>
                      {turn.sql && (
                        <pre className="text-xs bg-background/70 border border-muted rounded-md p-3 overflow-x-auto">
                          {turn.sql}
                        </pre>
                      )}
                      {turn.rationale && (
                        <p className="text-xs text-muted-foreground">{turn.rationale}</p>
                      )}
                      {turn.error && (
                        <p className="text-xs text-red-500">Error: {turn.error}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {turn.row_count !== null && (
                          <Badge variant="secondary">Rows: {turn.row_count}</Badge>
                        )}
                        {turn.fields?.length ? (
                          <Badge variant="outline">
                            Fields: {turn.fields.length}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => fetchAuditLogs(pagination.current_page - 1)}
              disabled={!canGoPrev}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => fetchAuditLogs(pagination.current_page + 1)}
              disabled={!canGoNext}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
