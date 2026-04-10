import type { User } from "@supabase/supabase-js";

/** For React Query or one-off checks; prefers same-origin BFF over client getUser(). */
export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  const body = (await res.json()) as { user: User | null };
  return body.user ?? null;
}
