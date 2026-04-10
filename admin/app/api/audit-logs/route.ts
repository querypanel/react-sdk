import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrganizationIdForRequest } from "@/lib/supabase/organization";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const orgId = resolved.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: resolved.source === "explicit" ? "Forbidden" : "No organization found" },
        { status: resolved.source === "explicit" ? 403 : 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const admin = createAdminClient();
    const { data: sessions, error: sessionsError, count } = await admin
      .from("query_sessions")
      .select(
        "id, session_id, tenant_id, user_id, title, created_at, updated_at",
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (sessionsError) {
      console.error("GET /api/audit-logs sessions error:", sessionsError);
      return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
    }

    const sessionIds = (sessions || []).map((session) => session.id);
    const { data: turns, error: turnsError } = sessionIds.length
      ? await admin
          .from("query_session_turns")
          .select(
            "id, session_id, turn_index, question, sql, rationale, row_count, fields, error, created_at"
          )
          .in("session_id", sessionIds)
          .order("turn_index", { ascending: true })
      : { data: [], error: null };

    if (turnsError) {
      console.error("GET /api/audit-logs turns error:", turnsError);
      return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
    }

    const turnsBySession = new Map<string, typeof turns>();
    (turns || []).forEach((turn) => {
      const list = turnsBySession.get(turn.session_id) || [];
      list.push(turn);
      turnsBySession.set(turn.session_id, list);
    });

    const sessionsWithTurns = (sessions || []).map((session) => ({
      ...session,
      turns: turnsBySession.get(session.id) || [],
    }));

    const pagination = {
      current_page: page,
      page_size: limit,
      total_count: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    };

    return NextResponse.json({ sessions: sessionsWithTurns, pagination });
  } catch (error) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
