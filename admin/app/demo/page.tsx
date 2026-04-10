"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import favicon from "@/app/favicon.svg";
import { trackEvent, trackPageView } from "@/lib/analytics/mixpanel";
import {
  SparklesIcon,
  ArrowRightIcon,
  PlayIcon,
  FilmIcon,
  ClapperboardIcon,
  PopcornIcon,
} from "lucide-react";

// Import from local SDK
import {
  QueryInput,
  QueryResult,
  LoadingState,
  EmptyState,
  ErrorState,
  getColorsByPreset,
  type ColorPreset,
  type QueryResultType,
  type SqlModifications,
  type VizModifications,
  type PromptChip,
} from "@querypanel/react-sdk";

// Movie-themed example prompts
const PROMPT_CHIPS: PromptChip[] = [
  { text: "Shows added by year", key: "year_trend", emoji: "📈" },
  { text: "Top 10 countries by content", key: "top_countries", emoji: "🌍" },
  { text: "Movies vs TV Shows distribution in a piechart", key: "type_distribution", emoji: "🎬" },
  { text: "Content ratings breakdown", key: "ratings", emoji: "⭐" },
];

const SESSION_RESULT_KEY = "qp-demo:last-result";
const SESSION_ID_KEY = "qp-demo:session-id";
const SESSION_CONTEXT_KEY = "qp-demo:use-context";

const getDemoSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_ID_KEY);
  } catch (e) {
    console.warn("Failed to read demo session id", e);
    return null;
  }
};

const setDemoSessionId = (sessionId: string | null) => {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) {
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    } else {
      sessionStorage.removeItem(SESSION_ID_KEY);
    }
  } catch (e) {
    console.warn("Failed to persist demo session id", e);
  }
};

export default function DemoPage() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResultType | null>(null);
  const [colorPreset, setColorPreset] = useState<ColorPreset>("default");
  const [hasRun, setHasRun] = useState(false);
  const [useContextAware, setUseContextAware] = useState(true);

  useEffect(() => {
    trackPageView("Demo Page");
  }, []);

  // Load cached result for faster iteration
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cachedContext = sessionStorage.getItem(SESSION_CONTEXT_KEY);
      if (cachedContext !== null) {
        setUseContextAware(cachedContext === "true");
      }
      const cached = sessionStorage.getItem(SESSION_RESULT_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.result?.success) {
          setResult(parsed.result);
          setQuery(parsed.query ?? "");
          setColorPreset(parsed.colorPreset ?? "default");
          setHasRun(true);
        }
      }
    } catch (e) {
      console.warn("Failed to load cached demo result", e);
    }
  }, []);

  const persistSession = useCallback(
    (res: QueryResultType, q: string, preset: ColorPreset) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.setItem(
          SESSION_RESULT_KEY,
          JSON.stringify({ result: res, query: q, colorPreset: preset })
        );
      } catch (e) {
        console.warn("Failed to cache demo result", e);
      }
    },
    []
  );

  const handleAsk = useCallback(
    async (question: string) => {
      if (!question.trim()) return;

      setIsLoading(true);
      setError(null);
      setQuery(question);
      trackEvent("Demo Query Submitted", { query: question });

      try {
        const querypanelSessionId = useContextAware ? getDemoSessionId() : null;
        const response = await fetch("/api/demo/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, querypanelSessionId }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to process query");
        }

        setResult(data);
        setHasRun(true);
        persistSession(data, question, colorPreset);
        setDemoSessionId(data.querypanelSessionId ?? null);
        trackEvent("Demo Chart Generated", {
          query: question,
          hasChart: !!data.chart?.vegaLiteSpec,
          rowCount: data.rows?.length || 0,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        trackEvent("Demo Query Error", { query: question, error: errorMessage });
      } finally {
        setIsLoading(false);
      }
    },
    [colorPreset, persistSession, useContextAware]
  );

  const handleChipClick = useCallback(
    (chip: PromptChip) => {
      trackEvent("Demo Chip Clicked", { prompt: chip.text });
    },
    []
  );

  const handleModify = useCallback(
    async (options: {
      sqlModifications?: SqlModifications;
      vizModifications?: VizModifications;
      colorPreset?: ColorPreset;
    }) => {
      if (!result?.sql) return;

      if (options.colorPreset) {
        setColorPreset(options.colorPreset);
      }

      // If only colors changed, skip API call
      if (!options.sqlModifications && !options.vizModifications) {
        if (result) {
          persistSession(result, query, options.colorPreset ?? colorPreset);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/demo/modify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql: result.sql,
            question: query,
            params: result.params,
            sqlModifications: options.sqlModifications,
            vizModifications: options.vizModifications,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to modify chart");
        }

        setResult(data);
        persistSession(data, query, options.colorPreset ?? colorPreset);
        trackEvent("Demo Chart Modified", {
          query,
          sqlChanged: data.modified?.sqlChanged ?? false,
          vizChanged: data.modified?.vizChanged ?? false,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        trackEvent("Demo Chart Modify Error", { query, error: errorMessage });
      } finally {
        setIsLoading(false);
      }
    },
    [colorPreset, persistSession, query, result]
  );

  const colors = getColorsByPreset(colorPreset);

  return (
    <main className="min-h-screen flex flex-col bg-[#0a0612] text-white overflow-hidden">
      {/* Cinematic background with purple-blue gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[150px]" />
        <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 w-[700px] h-[400px] bg-purple-700/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,6,18,0.6)_100%)]" />
        <div className="absolute left-0 top-0 bottom-0 w-8 opacity-[0.03]">
          <div className="h-full bg-repeat-y bg-[length:32px_48px]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='48'%3E%3Crect x='4' y='4' width='8' height='12' rx='1' fill='%238B5CF6'/%3E%3Crect x='4' y='32' width='8' height='12' rx='1' fill='%238B5CF6'/%3E%3C/svg%3E\")" }} />
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-8 opacity-[0.03]">
          <div className="h-full bg-repeat-y bg-[length:32px_48px]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='48'%3E%3Crect x='20' y='4' width='8' height='12' rx='1' fill='%233B82F6'/%3E%3Crect x='20' y='32' width='8' height='12' rx='1' fill='%233B82F6'/%3E%3C/svg%3E\")" }} />
        </div>
      </div>

      {/* Navigation */}
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
              Demo
            </Badge>
            <ThemeSwitcher />
            <Button
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-6 shadow-lg shadow-purple-500/25"
              onClick={() => {
                trackEvent("Demo CTA Clicked", { location: "navbar", button: "Get Started" });
                window.location.href = "/auth/sign-up";
              }}
            >
              Get Started
              <ArrowRightIcon className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 relative z-10 flex flex-col">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
              <PopcornIcon className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-purple-200">Explore 1000 titles from the Netflix catalog</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 tracking-tight leading-none">
              <span className="text-white">Query </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-violet-400 to-blue-400">
                Netflix
              </span>
              <br />
              <span className="text-gray-400 text-2xl sm:text-3xl lg:text-4xl font-bold">without knowing the schema</span>
            </h1>

            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Ask questions in plain English. Get instant SQL queries and beautiful visualizations.
            </p>
          </div>

          {/* Query Input - Using SDK Component */}
          <QueryInput
            value={query}
            onChange={setQuery}
            onSubmit={handleAsk}
            isLoading={isLoading}
            placeholder="What would you like to know about Netflix content?"
            chips={PROMPT_CHIPS}
            onChipClick={handleChipClick}
            colors={colors}
            submitLabel={
              <>
                <SparklesIcon className="w-5 h-5" />
                Ask
              </>
            }
            className="mb-6"
          />
          <div className="mb-10 flex items-center justify-between gap-4 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-sm text-purple-100">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-purple-500/40 bg-black/40 text-purple-400 focus:ring-purple-500/60"
                checked={useContextAware}
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  setUseContextAware(nextValue);
                  try {
                    sessionStorage.setItem(SESSION_CONTEXT_KEY, String(nextValue));
                  } catch (e) {
                    console.warn("Failed to persist context toggle", e);
                  }
                }}
              />
              <span className="font-medium">Use context-aware session history</span>
            </label>
            <span className="text-xs text-purple-300">
              Keeps follow-up questions in the same session.
            </span>
          </div>

          {/* Results Area - Using SDK Components */}
          <div className="flex-1">
            {/* Initial Loading State */}
            {isLoading && !hasRun && (
              <LoadingState
                message="Generating your visualization..."
                submessage="AI is analyzing the Netflix catalog"
                colors={colors}
                icon={<ClapperboardIcon className="w-8 h-8" />}
              />
            )}

            {/* Error State */}
            {!isLoading && error && (
              <ErrorState
                message={error}
                helpText="Make sure the environment variables are configured correctly."
                colors={colors}
              />
            )}

            {/* Empty State */}
            {!isLoading && !error && !result && (
              <EmptyState
                title="Ready to explore"
                description="Ask anything about Netflix shows and movies. Try one of the example prompts above or type your own question."
                features={[
                  { label: "1000 titles", color: colors.primary },
                  { label: "Real data", color: "#10B981" },
                  { label: "AI-powered", color: colors.secondary },
                ]}
                colors={colors}
                icon={<FilmIcon className="w-12 h-12" style={{ color: colors.primary }} />}
              />
            )}

            {/* Results - Using SDK QueryResult Component */}
            {result && hasRun && (
              <QueryResult
                result={result}
                query={query}
                isLoading={isLoading}
                colorPreset={colorPreset}
                onModify={handleModify}
                colors={colors}
                showControls={true}
                showSql={true}
                showTable={true}
                showSpec={true}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-purple-500/10 py-8 bg-black/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src={favicon} alt="QueryPanel" width={20} height={20} className="opacity-60" />
              <span className="text-sm text-gray-500">© {new Date().getFullYear()} QueryPanel</span>
              <span className="text-gray-700">•</span>
              <span className="text-xs text-gray-600">Netflix data is for demo purposes only</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                Home
              </Link>
              <Link href="/auth/sign-up" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                Sign Up
              </Link>
              <a
                href="https://www.npmjs.com/package/@querypanel/node-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-purple-400 transition-colors"
              >
                npm Package
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
