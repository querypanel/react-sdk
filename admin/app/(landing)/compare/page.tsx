import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import LandingNav from "@/components/layout/LandingNav";
import { Button } from "@/components/ui/button";

const siteUrl = "https://querypanel.io";

export const metadata: Metadata = {
  title: "QueryPanel vs Embedded Analytics Alternatives",
  description:
    "Compare QueryPanel with Sisense, ThoughtSpot, GoodData, Qrvey, and Embeddable for customer-facing SaaS analytics.",
  alternates: {
    canonical: `${siteUrl}/compare`,
  },
  openGraph: {
    title: "QueryPanel vs Embedded Analytics Alternatives",
    description:
      "A practical comparison of embedded analytics platforms for SaaS teams.",
    url: `${siteUrl}/compare`,
    siteName: "QueryPanel",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "QueryPanel vs Embedded Analytics Alternatives",
    description:
      "Compare QueryPanel with popular embedded analytics tools.",
    images: ["/og-image.png"],
  },
};

const comparisons = [
  {
    slug: "sisense",
    name: "Sisense",
    bestFor: "Large enterprise embedded BI deployments",
    whyQueryPanel:
      "QueryPanel is optimized for fast SaaS integration with tenant-aware AI SQL generation and lighter operational overhead.",
  },
  {
    slug: "thoughtspot",
    name: "ThoughtSpot Embedded",
    bestFor: "Search-first analytics experiences at scale",
    whyQueryPanel:
      "QueryPanel focuses on developer-controlled customer analytics flows from prompt to SQL to dashboard with tenant-safe scoping.",
  },
  {
    slug: "gooddata",
    name: "GoodData",
    bestFor: "Governance-heavy semantic BI programs",
    whyQueryPanel:
      "QueryPanel gives product teams a simpler path to ship customer-facing analytics quickly without rebuilding core analytics infrastructure.",
  },
  {
    slug: "qrvey",
    name: "Qrvey",
    bestFor: "Turnkey multi-tenant analytics stacks",
    whyQueryPanel:
      "QueryPanel keeps your app and data flow flexible while still delivering strong tenant-aware SQL generation and embedded experiences.",
  },
  {
    slug: "embeddable",
    name: "Embeddable",
    bestFor: "Teams wanting deep front-end chart composition control",
    whyQueryPanel:
      "QueryPanel combines embedding with AI-native SQL and dashboard generation, reducing time-to-value for product and engineering teams.",
  },
];

const strengths = [
  "AI-native natural language to SQL",
  "Built for customer-facing SaaS analytics",
  "Tenant-aware query generation workflow",
  "Works with PostgreSQL, ClickHouse, BigQuery, and MySQL",
  "Fast embed path through SDK + dashboard tooling",
];

export default function ComparePage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <LandingNav />

      <section className="py-20 md:py-28">
        <div className="container px-4 max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
            QueryPanel vs embedded analytics alternatives
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            A practical comparison for SaaS teams choosing a customer-facing analytics platform.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/auth/sign-up">Start building</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full">
              <Link href="/demo">View demo</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container px-4 max-w-5xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-semibold mb-6">
              Why teams choose QueryPanel
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strengths.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  </span>
                  <span className="text-sm md:text-base">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="pb-20 md:pb-28">
        <div className="container px-4 max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold mb-8">
            Alternative-by-alternative breakdown
          </h2>
          <div className="space-y-5">
            {comparisons.map((item) => (
              <article
                key={item.slug}
                id={item.slug}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <h3 className="text-xl font-semibold mb-2">QueryPanel vs {item.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  <strong className="text-foreground">Best fit for {item.name}:</strong>{" "}
                  {item.bestFor}
                </p>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                    <CheckIcon className="w-3.5 h-3.5 text-indigo-400" />
                  </span>
                  <p className="text-sm md:text-base">{item.whyQueryPanel}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container px-4 max-w-4xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Need a deeper comparison for your stack?
            </h2>
            <p className="text-muted-foreground mb-8">
              Share your data stack and product constraints and we can map the fastest path to embedded analytics.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-full">
                <Link href="/auth/sign-up">Start free</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/">Back to landing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
