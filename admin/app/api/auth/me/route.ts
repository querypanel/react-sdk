import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Same-origin user hydration for the admin UI. Validates the session on the server
 * so the browser does not need to call Supabase Auth `/user` for initial profile load.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}
