"use client";

import { useEffect } from "react";
import { initMixpanel, identifyUser } from "@/lib/analytics/mixpanel";
import { useAuth } from "@/lib/context/AuthContext";

export function MixpanelProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    initMixpanel();
  }, []);

  useEffect(() => {
    if (isLoading || !user?.email) return;
    identifyUser(user.id, {
      email: user.email,
      created_at: user.created_at,
    });
  }, [isLoading, user]);

  return <>{children}</>;
}

