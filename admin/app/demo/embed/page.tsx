"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, PlayIcon } from "lucide-react";
import { QuerypanelEmbedded } from "@querypanel/react-sdk";
import favicon from "@/app/favicon.svg";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackEvent, trackPageView } from "@/lib/analytics/mixpanel";

interface DemoTokenResponse {
  success: boolean;
  apiBaseUrl?: string;
  jwt?: string;
  tenantId?: string;
  userId?: string | null;
  error?: string;
}

function truncateJwt(value: string, head = 20, tail = 8): string {
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const DEMO_TENANT_ID = "tenant_a";
const DEMO_USER_ID = "demo-user";

export default function EmbeddedDemoPage() {
  const [dashboardId, setDashboardId] = useState("");
  const [allowCustomization, setAllowCustomization] = useState(true);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackPageView("Embedded Demo Page");
  }, []);

  const canLoadEmbed = useMemo(
    () => Boolean(dashboardId.trim()),
    [dashboardId],
  );

  const handleLoadDashboard = async () => {
    if (!canLoadEmbed) return;

    setIsPreparingSession(true);
    setError(null);

    try {
      const response = await fetch("/api/demo/embed-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: DEMO_TENANT_ID,
          userId: DEMO_USER_ID || undefined,
        }),
      });

      const data = (await response.json()) as DemoTokenResponse;
      if (!response.ok || !data.success || !data.apiBaseUrl || !data.jwt) {
        throw new Error(data.error || "Failed to prepare embedded session");
      }

      setApiBaseUrl(data.apiBaseUrl);
      setJwt(data.jwt);
      trackEvent("Embedded Demo Loaded", {
        dashboardId: dashboardId.trim(),
        tenantId: DEMO_TENANT_ID,
        customization: allowCustomization,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      setApiBaseUrl(null);
      setJwt(null);
      trackEvent("Embedded Demo Load Error", { error: message });
    } finally {
      setIsPreparingSession(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#0a0612] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[150px]" />
        <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 w-[700px] h-[400px] bg-purple-700/10 rounded-full blur-[140px]" />
      </div>

      <nav className="relative z-50 border-b border-purple-500/10 bg-black/40 backdrop-blur-xl sticky top-0">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
              <Image src={favicon} alt="QueryPanel" width={32} height={32} />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent group-hover:from-purple-300 group-hover:to-blue-300 transition-all">
              QueryPanel
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 px-3 py-1 font-medium">
              <PlayIcon className="w-3 h-3 mr-1.5 fill-current" />
              Embedded Demo
            </Badge>
            <ThemeSwitcher />
            <Button
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-6 shadow-lg shadow-purple-500/25"
              onClick={() => {
                window.location.href = "/auth/sign-up";
              }}
            >
              Get Started
              <ArrowRightIcon className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">Customer-side embed demo</h1>
              <Link href="/demo" className="text-sm text-purple-300 hover:text-purple-200">
                Back to NLQ demo
              </Link>
            </div>
            <p className="mt-2 text-sm text-gray-300">
              This simulates customer embedding with <code>QuerypanelEmbedded</code> where frontend calls{" "}
              <code>querypanel-sdk</code> directly using <code>apiBaseUrl</code> and a server-generated JWT.
            </p>

            <p className="mt-4 text-sm text-purple-200/80">Usage (edit dashboard ID, then load):</p>
            <pre className="mt-2 rounded-xl border border-white/10 bg-[#0f0d14] p-4 text-sm font-mono overflow-x-auto">
              <code className="flex flex-col gap-0 text-[13px] leading-relaxed">
                <span>
                  <span className="text-purple-400">&lt;</span>
                  <span className="text-blue-400">QuerypanelEmbedded</span>
                </span>
                <span className="pl-2">
                  <span className="text-blue-300"> dashboardId</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-emerald-400">&quot;</span>
                  <input
                    type="text"
                    className="inline-block min-w-[180px] max-w-full rounded border border-purple-500/40 bg-black/50 px-2 py-0.5 text-emerald-300 placeholder:text-gray-500 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/50"
                    placeholder="e.g. 3ed3b98f-..."
                    value={dashboardId}
                    onChange={(e) => setDashboardId(e.target.value)}
                    aria-label="Dashboard ID"
                  />
                  <span className="text-emerald-400">&quot;</span>
                </span>
                <span className="pl-2">
                  <span className="text-blue-300"> apiBaseUrl</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-gray-500">{"{"}</span>
                  <span className="text-amber-200/90 select-all" title={apiBaseUrl ?? undefined}>
                    {apiBaseUrl ?? "—"}
                  </span>
                  <span className="text-gray-500">{"}"}</span>
                </span>
                <span className="pl-2">
                  <span className="text-blue-300"> jwt</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-gray-500">{"{"}</span>
                  <span className="text-amber-200/90 select-all" title={jwt ?? undefined}>
                    {jwt ? truncateJwt(jwt) : "—"}
                  </span>
                  <span className="text-gray-500">{"}"}</span>
                </span>
                <span className="pl-2">
                  <span className="text-blue-300"> allowCustomization</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-amber-200/90">{String(allowCustomization)}</span>
                </span>
                <span className="pl-2">
                  <span className="text-blue-300"> darkMode</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-amber-200/90">true</span>
                </span>
                <span>
                  <span className="text-purple-400">/&gt;</span>
                </span>
              </code>
            </pre>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Button
                disabled={!canLoadEmbed || isPreparingSession}
                onClick={handleLoadDashboard}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
              >
                {isPreparingSession ? "Generating customer JWT..." : "Load embedded dashboard"}
              </Button>
              <label className="inline-flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowCustomization}
                  onChange={(e) => setAllowCustomization(e.target.checked)}
                  className="rounded border-gray-500 bg-black/50 text-purple-500 focus:ring-purple-400"
                />
                Allow customization
              </label>
              <span className="text-xs text-gray-500">
                Session: <span className="text-gray-400">{DEMO_TENANT_ID}</span>
                {" · "}
                <span className="text-gray-400">{DEMO_USER_ID}</span>
              </span>
            </div>

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 min-h-[420px]">
            {!apiBaseUrl || !jwt || !dashboardId.trim() ? (
              <p className="text-sm text-gray-400">
                Enter a dashboard and tenant, then load the embed to render <code>QuerypanelEmbedded</code>.
              </p>
            ) : (
              <div className="dark">
                <QuerypanelEmbedded
                  dashboardId={dashboardId.trim()}
                  apiBaseUrl={apiBaseUrl}
                  jwt={jwt}
                  allowCustomization={allowCustomization}
                  darkMode={true}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
