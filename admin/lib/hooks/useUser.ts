import { useAuth } from "@/lib/context/AuthContext";

/** @deprecated Prefer useAuth() for new code. */
export function useUser() {
  const { user, isLoading: loading } = useAuth();
  return { user, loading };
}
