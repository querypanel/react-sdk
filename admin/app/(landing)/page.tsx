"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  CheckIcon,
  CodeIcon,
  DatabaseIcon,
  PlayCircleIcon,
  Github,
  LayoutDashboardIcon,
  Sparkles,
  ArrowRight,
  Zap,
  Lock,
  Cpu,
  Shield,
  Terminal,
} from "lucide-react";
import { ContactSalesDialog } from "@/components/contact-sales-dialog";
import LandingNav from "@/components/layout/LandingNav";
import Image from "next/image";
import favicon from "@/app/favicon.svg";
import { track } from "@vercel/analytics";
import { trackEvent, trackPageView } from "@/lib/analytics/mixpanel";
import { motion } from "framer-motion";
import { Pricing } from "@/components/landing/Pricing";

const HOW_IT_WORKS_ID = "how-it-works";
const PRICING_ID = "pricing";
const DEMO_VIDEO_ID = "demo-video";

const HORROR_STACK = [
  "Database",
  "Custom API layer",
  "Auth + permissions",
  "Query engine",
  "Chart library",
  "Dashboard builder",
  "Customer UI",
  "Ongoing maintenance",
];

const AI_PIPELINE_STEPS = [
  { num: "01", title: "User asks", emoji: "💬", ringClass: "ring-indigo-500/30", bgClass: "bg-indigo-500/10", textClass: "text-indigo-400" },
  { num: "02", title: "AI reads schema", emoji: "🧠", ringClass: "ring-violet-500/30", bgClass: "bg-violet-500/10", textClass: "text-violet-400" },
  { num: "03", title: "SQL generated", emoji: "⚡", ringClass: "ring-purple-500/30", bgClass: "bg-purple-500/10", textClass: "text-purple-400" },
  { num: "04", title: "Chart created", emoji: "📊", ringClass: "ring-cyan-500/30", bgClass: "bg-cyan-500/10", textClass: "text-cyan-400" },
  { num: "05", title: "Dashboard live", emoji: "✨", ringClass: "ring-emerald-500/30", bgClass: "bg-emerald-500/10", textClass: "text-emerald-400" },
];

export default function LandingPage() {
  React.useEffect(() => {
    trackPageView("Landing Page");
  }, []);

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground selection:bg-indigo-500/30 overflow-x-hidden">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-32 md:pt-36 md:pb-40 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        <div className="absolute inset-0 w-full h-full bg-background z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[128px] animate-blob z-0" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px] animate-blob animation-delay-2000 z-0" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px] animate-blob animation-delay-4000 z-0" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-sm font-medium text-muted-foreground"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>AI-native analytics infrastructure</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight"
          >
            Customers ask for dashboards. <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
              Your roadmap pays the price.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
          >
            Stop spending months building analytics infrastructure. QueryPanel turns natural language into tenant-safe SQL, charts, and embedded dashboards so PMs and founders can ship customer analytics fast.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4"
          >
            <Button
              size="lg"
              className="h-14 px-8 text-lg rounded-full bg-foreground text-background hover:bg-foreground/90 hover:scale-105 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] dark:shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)]"
              onClick={() => {
                track("cta_clicked", { location: "hero", button_text: "Start building", destination: "/auth/sign-up" });
                trackEvent("Button Clicked", { location: "hero", button_text: "Start building", destination: "/auth/sign-up" });
                window.location.href = "/auth/sign-up";
              }}
            >
              Start building
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-8 text-lg rounded-full border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-all"
              onClick={() => {
                track("cta_clicked", { location: "hero", button_text: "View demo", destination: "/demo" });
                trackEvent("Button Clicked", { location: "hero", button_text: "View demo", destination: "/demo" });
                window.location.href = "/demo";
              }}
            >
              <PlayCircleIcon className="w-5 h-5 mr-2" />
              View demo
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-20 relative max-w-4xl mx-auto"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-2xl blur opacity-20" />
            <button
              type="button"
              className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/50 backdrop-blur-xl aspect-video flex items-center justify-center group cursor-pointer shadow-2xl w-full"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(DEMO_VIDEO_ID)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center z-20 group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300">
                <PlayCircleIcon className="w-10 h-10 text-white ml-1" />
              </div>
              <div className="absolute bottom-6 left-0 right-0 text-center z-20">
                <span className="text-sm font-medium text-white/80 tracking-widest uppercase">20 SECOND OVERVIEW</span>
              </div>
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="py-24 md:py-32 relative z-10 overflow-hidden">
        {/* Warm amber-red temperature for "pain" — dark-mode only tint */}
        <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-amber-950/20 dark:via-red-950/10 dark:to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-red-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="container px-4 max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              The problem
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-5">
              Every SaaS product hits the{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400">
                same wall.
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Customers demand analytics. Building dashboards means building an entire
              data infrastructure — months of engineering for something that isn&apos;t your core product.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Horror stack */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-b from-red-500/30 via-red-500/10 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-red-950/20 p-8 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-[60px]" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center text-red-400 text-base">
                      ✗
                    </div>
                    <h3 className="text-sm font-bold text-red-500 dark:text-red-300 uppercase tracking-wider">Building it yourself</h3>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {HORROR_STACK.map((step, i) => (
                      <div key={step} className="flex items-center gap-3">
                        <span className="text-xs text-red-400 dark:text-red-500/50 font-mono w-4 flex-shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 py-2 px-3 rounded-lg border border-red-500/10 bg-muted/60 dark:bg-black/30 text-sm text-foreground/60">
                          {step}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400/60 mt-5 pt-4 border-t border-red-200 dark:border-red-500/10 font-medium">
                    ≈ 6 months of engineering. None of it is your product.
                  </p>
                </div>
              </div>
            </div>

            {/* QueryPanel solution */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-b from-emerald-500/30 via-emerald-500/10 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-emerald-950/20 p-8 h-full relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-[60px]" />
                <div className="relative z-10 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                      <CheckIcon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">With QueryPanel</h3>
                  </div>

                  <div className="flex flex-col gap-4 flex-1">
                    <div className="py-3 px-4 rounded-xl border border-emerald-500/20 bg-muted/80 dark:bg-black/40 font-mono text-sm text-emerald-700 dark:text-emerald-300">
                      npm install @querypanel/node-sdk
                    </div>
                    <div className="flex justify-center">
                      <div className="w-px h-7 bg-gradient-to-b from-emerald-500/40 to-transparent" />
                    </div>
                    <div className="py-3 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-foreground/80">
                      Connect your database
                    </div>
                    <div className="flex justify-center">
                      <div className="w-px h-7 bg-gradient-to-b from-emerald-500/40 to-transparent" />
                    </div>
                    <div className="py-3 px-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm font-medium flex items-center gap-2">
                      <CheckIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>AI-powered dashboards embedded in your product</span>
                    </div>
                  </div>

                  <p className="text-sm text-emerald-700 dark:text-emerald-400/60 mt-5 pt-4 border-t border-emerald-200 dark:border-emerald-500/10 font-medium">
                    Ship analytics in days. Focus on your product.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Flow ── */}
      <section id={HOW_IT_WORKS_ID} className="py-24 md:py-32 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_40%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

        <div className="container px-4 max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-6">
              <Cpu className="w-3.5 h-3.5" />
              How it works
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-5">
              Turn data into dashboards with{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Question → AI → SQL → Chart → Dashboard. In seconds.
            </p>
          </div>

          {/* Pipeline overview */}
          <div className="relative mb-14">
            {/* Connecting line desktop */}
            <div
              className="absolute left-0 right-0 top-7 h-px hidden md:block"
              style={{ background: "linear-gradient(to right, transparent, rgba(99,102,241,0.18) 15%, rgba(99,102,241,0.18) 85%, transparent)" }}
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-4">
              {AI_PIPELINE_STEPS.map((step) => (
                <div key={step.num} className="flex flex-col items-center text-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl ring-1 flex items-center justify-center text-2xl relative z-10 transition-transform duration-300 hover:scale-110 ${step.ringClass} ${step.bgClass}`}>
                    {step.emoji}
                  </div>
                  <div>
                    <div className={`text-xs font-mono mb-0.5 ${step.textClass}`}>{step.num}</div>
                    <div className="font-semibold text-sm">{step.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Natural language — wide */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-indigo-500/30 via-indigo-500/10 to-transparent md:col-span-2">
              <div className="rounded-3xl bg-card dark:bg-black/60 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-2">Natural language</h3>
                  <p className="text-muted-foreground mb-6 text-sm">Customers ask questions in plain English. No SQL required.</p>
                  <div className="p-4 rounded-xl bg-muted/80 dark:bg-black/50 border border-border font-mono text-sm text-indigo-600 dark:text-indigo-300">
                    &gt; &ldquo;What was our revenue by country last quarter?&rdquo;
                  </div>
                </div>
              </div>
            </div>

            {/* AI context */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-purple-500/30 via-purple-500/10 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-black/60 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
                <Cpu className="w-24 h-24 text-purple-400/10 absolute bottom-0 right-0" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-2">AI reads context</h3>
                  <p className="text-muted-foreground text-sm">
                    Understands your database schema, tenant structure, and data relationships instantly.
                  </p>
                </div>
              </div>
            </div>

            {/* SQL */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-cyan-500/30 via-cyan-500/10 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-black/60 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent" />
                <Zap className="w-24 h-24 text-cyan-400/10 absolute bottom-0 right-0" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-2">SQL generated</h3>
                  <p className="text-muted-foreground text-sm">
                    Parameterized, tenant-scoped, validated SQL — ready to execute.
                  </p>
                </div>
              </div>
            </div>

            {/* Dashboard — wide */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-emerald-500/30 via-emerald-500/10 to-transparent md:col-span-2">
              <div className="rounded-3xl bg-card dark:bg-black/60 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
                <div className="relative z-10 flex flex-col h-full">
                  <h3 className="text-xl font-bold mb-2">Charts & dashboards rendered</h3>
                  <p className="text-muted-foreground mb-6 text-sm">Auto-generated and embedded natively in your app.</p>
                  <div className="mt-auto h-24 rounded-xl border border-border bg-muted/50 dark:bg-black/40 flex items-end justify-around px-4 pb-3 gap-2">
                    {([{ h: 40, o: 0.30 }, { h: 70, o: 0.38 }, { h: 100, o: 0.46 }, { h: 60, o: 0.54 }, { h: 85, o: 0.62 }, { h: 50, o: 0.70 }]).map(({ h, o }) => (
                      <div
                        key={`emerald-bar-${h}`}
                        className="w-full rounded-t-sm"
                        style={{ height: `${h}%`, background: `rgba(52,211,153,${o})` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Overview ── */}
      <section className="py-24 md:py-32 relative z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="container px-4 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground text-sm font-medium mb-6">
              <CodeIcon className="w-3.5 h-3.5" />
              The product
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Two ways to ship analytics
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Embed SQL generation in your backend with the SDK, or drop in a full dashboard workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SDK — terminal aesthetic */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-indigo-500/40 via-indigo-500/10 to-transparent">
              <div className="rounded-3xl bg-[#080c18] overflow-hidden flex flex-col h-full text-white">
                {/* Window chrome — always dark */}
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                  <span className="text-xs text-white/40 ml-2 font-mono">terminal</span>
                </div>
                <div className="p-8 flex flex-col flex-1">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/30">
                    <Terminal className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 text-white">Headless SDK</h3>
                  <p className="text-white/60 mb-8 text-sm leading-relaxed">
                    Generate SQL and charts from your backend. Render with your UI or ours. Complete control.
                  </p>
                  <div className="mt-auto space-y-3 font-mono text-sm bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">$</span>
                      <span className="text-white/70">npm install <span className="text-indigo-300">@querypanel/node-sdk</span></span>
                    </div>
                    <div className="border-t border-white/10 pt-3 text-xs space-y-1 text-white/50">
                      <div><span className="text-purple-400">const</span> qp = <span className="text-cyan-400">new</span> <span className="text-yellow-300">QueryPanelSdkAPI</span>(...);</div>
                      <div><span className="text-purple-400">const</span> result = <span className="text-cyan-400">await</span> qp.<span className="text-indigo-300">ask</span>(<span className="text-emerald-300">&quot;Revenue?&quot;</span>);</div>
                      <div className="text-white/30">{"// result.sql, result.chart, result.data"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard card */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-br from-purple-500/40 via-purple-500/10 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-black/60 p-8 flex flex-col h-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6 border border-purple-500/30">
                    <LayoutDashboardIcon className="w-6 h-6 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Dashboard Builder</h3>
                  <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                    Drop-in React components giving customers a full analytics workspace: dashboards, filters, saved views, and chart exploration.
                  </p>

                  {/* Mini dashboard mockup */}
                  <div className="mt-auto rounded-xl border border-border bg-muted/50 dark:bg-black/40 p-4 space-y-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-purple-400/60" />
                      <div className="h-1.5 w-20 rounded-full bg-white/10" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-10 rounded-lg bg-purple-500/10 border border-purple-500/10" />
                      <div className="h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/10" />
                      <div className="h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/10" />
                    </div>
                    <div className="h-14 rounded-lg bg-white/[0.03] border border-white/10 flex items-end justify-around px-3 pb-2 gap-1">
                      {[35, 60, 45, 80, 55, 70, 40].map((h) => (
                        <div key={`purple-bar-${h}`} className="flex-1 bg-purple-400/40 rounded-t-sm" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-muted-foreground">Drop-in React</span>
                    <span className="text-xs px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-muted-foreground">White-label ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security & Data Stack ── */}
      <section className="py-20 md:py-24 relative z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        <div className="container px-4 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Alternatives
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-5">
            QueryPanel vs embedded analytics alternatives
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Compare QueryPanel with Sisense, ThoughtSpot, GoodData, Qrvey, and Embeddable to choose the best fit for customer-facing SaaS analytics.
          </p>
          <a
            href="/compare"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            View full comparison
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── Security & Data Stack ── */}
      <section className="py-24 md:py-32 relative z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-emerald-950/10 dark:to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none" />

        <div className="container px-4 max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
              <Shield className="w-3.5 h-3.5" />
              Developer trust
            </div>
            <h2 className="text-3xl md:text-5xl font-bold">
              Built for your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">infrastructure.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Security */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-b from-emerald-500/20 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-black/40 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 dark:bg-gradient-to-br dark:from-emerald-950/20 dark:to-transparent" />
                <div className="relative z-10">
                  <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                    Your data stays in your infrastructure. We generate the SQL, you execute it in your environment.
                  </p>
                  <ul className="space-y-4">
                    {[
                      "Data never leaves your infrastructure",
                      "SQL executed in your environment",
                      "Schema metadata only",
                      "Multi-tenant isolation by default",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center border border-emerald-500/25 flex-shrink-0">
                          <CheckIcon className="w-3 h-3 text-emerald-400" />
                        </div>
                        <span className="font-medium text-foreground/90">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Data stacks */}
            <div className="p-[1px] rounded-3xl bg-gradient-to-b from-cyan-500/20 to-transparent">
              <div className="rounded-3xl bg-card dark:bg-black/40 p-8 h-full relative overflow-hidden">
                <div className="absolute inset-0 dark:bg-gradient-to-br dark:from-cyan-950/20 dark:to-transparent" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <DatabaseIcon className="w-5 h-5 text-cyan-400" />
                    Works with your data stack
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Connect to your existing databases. No migrations, no data copies.
                  </p>
                  <div className="flex flex-col gap-2">
                    {["PostgreSQL", "ClickHouse", "BigQuery", "MySQL"].map((db) => (
                      <div
                        key={db}
                        className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] font-medium flex items-center justify-between group hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-all duration-200"
                      >
                        <span className="text-foreground/80 group-hover:text-foreground transition-colors text-sm">{db}</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                      </div>
                    ))}
                    <div className="px-4 py-3 rounded-xl border border-dashed border-border bg-muted/30 dark:bg-black/20 font-medium text-muted-foreground flex items-center justify-between">
                      <span className="text-sm">Snowflake</span>
                      <span className="text-xs uppercase tracking-wider bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Soon</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Demo Video ── */}
      <section id={DEMO_VIDEO_ID} className="py-24 md:py-32 relative z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="container px-4 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground text-sm font-medium mb-8">
            <PlayCircleIcon className="w-3.5 h-3.5" />
            Live demo
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-5">See it in action</h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Watch how QueryPanel turns a natural language question into a production-ready dashboard in under 3 minutes.
          </p>

          <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl p-2">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            <div className="rounded-2xl overflow-hidden aspect-video relative z-10">
              <iframe
                src="https://www.loom.com/embed/ab4718c742c8464ab64b286c894eb1ef?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true"
                frameBorder="0"
                allowFullScreen
                className="w-full h-full"
                title="QueryPanel Demo"
                allow="autoplay; fullscreen"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <Pricing />

      {/* ── Final CTA ── */}
      <section className="py-24 md:py-32 relative z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-transparent dark:via-indigo-950/20 dark:to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-500/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="container px-4 max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Stop building dashboards.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
              Start shipping analytics.
            </span>
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Join SaaS teams using QueryPanel to ship customer-facing analytics without building the infrastructure.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="h-14 px-8 text-lg rounded-full bg-foreground text-background hover:bg-foreground/90 hover:scale-105 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] dark:shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)]"
              onClick={() => {
                track("cta_clicked", { location: "final_cta", button_text: "Start building", destination: "/auth/sign-up" });
                trackEvent("Button Clicked", { location: "final_cta", button_text: "Start building", destination: "/auth/sign-up" });
                window.location.href = "/auth/sign-up";
              }}
            >
              Start building for free
            </Button>
            <ContactSalesDialog>
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 text-lg rounded-full border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-all"
              >
                Book a demo
              </Button>
            </ContactSalesDialog>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-12 bg-muted/30 dark:bg-black/40 relative z-10">
        <div className="container px-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-12">
            <div className="space-y-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <Image src={favicon} alt="QueryPanel" width={28} height={28} />
                <span className="font-bold text-lg tracking-tight">QueryPanel</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                AI-native customer-facing analytics infrastructure for SaaS. SQL, charts, and dashboards from your data.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-muted-foreground">
                  <Lock className="w-3 h-3" /> Zero credential storage
                </span>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <button
                    type="button"
                    onClick={() => document.getElementById(HOW_IT_WORKS_ID)?.scrollIntoView({ behavior: "smooth" })}
                    className="hover:text-foreground transition-colors"
                  >
                    How it works
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => document.getElementById(PRICING_ID)?.scrollIntoView({ behavior: "smooth" })}
                    className="hover:text-foreground transition-colors"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <a href="https://www.npmjs.com/package/@querypanel/node-sdk" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                    npm Package
                  </a>
                </li>
                <li>
                  <a href="/compare" className="hover:text-foreground transition-colors">
                    Compare alternatives
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Support</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <ContactSalesDialog>
                    <button type="button" className="hover:text-foreground transition-colors text-left">
                      Contact Sales
                    </button>
                  </ContactSalesDialog>
                </li>
                <li>
                  <a href="https://github.com/querypanel/node-sdk" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                    GitHub Issues
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Legal</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="/legal/terms" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="/legal/cookies" className="hover:text-foreground transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} QueryPanel. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/querypanel/node-sdk" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
                <span className="sr-only">GitHub</span>
                <Github className="w-5 h-5" />
              </a>
              <a href="https://www.linkedin.com/company/querypanel/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
                <span className="sr-only">LinkedIn</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
