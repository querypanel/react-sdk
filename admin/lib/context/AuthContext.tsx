"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    const body = (await res.json()) as { user: User | null };
    return body.user ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    const u = await fetchMe();
    setUser(u);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const u = await fetchMe();
      if (cancelled) return;
      setUser(u);
      setIsLoading(false);
    })();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
      void queryClient.invalidateQueries({ queryKey: ["user"] });
      // INITIAL_SESSION runs right after subscribe; invalidating here duplicates the
      // first useQuery fetch for organizations / team members.
      if (event !== "INITIAL_SESSION") {
        void queryClient.invalidateQueries({ queryKey: ["organizations"] });
        void queryClient.invalidateQueries({ queryKey: ["organization-members"] });
        void queryClient.invalidateQueries({ queryKey: ["jwks"] });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      refreshUser,
    }),
    [user, session, isLoading, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
