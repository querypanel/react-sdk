"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, MinusIcon, PlusIcon, ArrowRight } from "lucide-react";
import { ContactSalesDialog } from "@/components/contact-sales-dialog";
import { track } from "@vercel/analytics";
import { trackEvent } from "@/lib/analytics/mixpanel";

const PRICING_ID = "pricing";

const plans = [
  {
    name: "Free",
    price: "$0",
    desc: "Experimentation",
    cta: "Start building",
    highlight: false,
    limits: {
      tenants: "3",
      aiCharts: "50 / mo",
      workspaces: "1",
      dataSources: "1",
      dashboards: "1",
      editors: "1",
      viewers: "0",
    },
  },
  {
    name: "Starter",
    price: "$49",
    desc: "Small teams shipping first analytics features.",
    cta: "Contact sales",
    highlight: false,
    limits: {
      tenants: "10",
      aiCharts: "200 / mo",
      workspaces: "2",
      dataSources: "2",
      dashboards: "5",
      editors: "3",
      viewers: "5",
    },
  },
  {
    name: "Growth",
    price: "$249",
    desc: "Early SaaS delivering analytics to real customers.",
    cta: "Contact sales",
    highlight: false,
    limits: {
      tenants: "100",
      aiCharts: "1,000 / mo",
      workspaces: "5",
      dataSources: "5",
      dashboards: "50",
      editors: "10",
      viewers: "25",
    },
  },
  {
    name: "Scale",
    price: "$999",
    desc: "SaaS platforms where analytics is a core product feature.",
    cta: "Contact sales",
    highlight: true,
    limits: {
      tenants: "1,000",
      aiCharts: "5,000 / mo",
      workspaces: "Unlimited",
      dataSources: "Unlimited",
      dashboards: "Unlimited",
      editors: "Unlimited",
      viewers: "Unlimited",
    },
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "Unlimited scale and dedicated infrastructure.",
    cta: "Contact sales",
    highlight: false,
    limits: {
      tenants: "Unlimited",
      aiCharts: "Custom",
      workspaces: "Unlimited",
      dataSources: "Unlimited",
      dashboards: "Unlimited",
      editors: "Unlimited",
      viewers: "Unlimited",
    },
  },
];

const features = [
  { name: "AI Chart Generation", free: true, starter: true, growth: true, scale: true, enterprise: true },
  { name: "Embedded Dashboards", free: true, starter: true, growth: true, scale: true, enterprise: true },
  { name: "Dashboard Forks", free: false, starter: true, growth: true, scale: true, enterprise: true },
  { name: "White-label Analytics", free: false, starter: false, growth: true, scale: true, enterprise: true },
  { name: "RBAC Permissions", free: false, starter: false, growth: true, scale: true, enterprise: true },
  { name: "Audit Logs", free: false, starter: false, growth: false, scale: true, enterprise: true },
  { name: "SSO / SAML", free: false, starter: false, growth: false, scale: false, enterprise: true },
  { name: "Dedicated Infrastructure", free: false, starter: false, growth: false, scale: false, enterprise: true },
  { name: "SLA", free: false, starter: false, growth: false, scale: false, enterprise: true },
];

const faqs = [
  {
    q: "How are tenants counted?",
    a: "A tenant represents a distinct customer or organization within your SaaS product. We count the number of unique tenants that access or generate analytics in a given billing month."
  },
  {
    q: "What counts as an AI chart?",
    a: "An AI chart is generated whenever an end-user asks a natural language question that results in a new chart, or when an editor uses AI to create or modify a dashboard block."
  },
  {
    q: "What happens when limits are exceeded?",
    a: "You can purchase overage credits for AI charts. For tenant limits, we'll notify you when you approach your plan's limit and help you upgrade to the next tier. We never cut off access for your end-users without warning."
  },
  {
    q: "How are AI models selected?",
    a: "We route queries to the most appropriate model (e.g., OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet) based on complexity and your configuration. Enterprise customers can bring their own API keys or use self-hosted models."
  }
];

function FAQItem({ q, a }: { q: string, a: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-border rounded-2xl bg-card dark:bg-white/5 overflow-hidden shadow-sm">
      <button 
        type="button"
        className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-lg">{q}</span>
        {isOpen ? <MinusIcon className="w-5 h-5 text-muted-foreground" /> : <PlusIcon className="w-5 h-5 text-muted-foreground" />}
      </button>
      {isOpen && (
        <div className="px-6 pb-4 text-muted-foreground">
          {a}
        </div>
      )}
    </div>
  );
}

export function Pricing() {
  return (
    <div id={PRICING_ID} className="flex flex-col w-full">
      {/* 1. Pricing Narrative */}
      <section className="py-24 md:py-32 relative z-10 border-t border-border bg-muted/20 dark:border-white/5 dark:bg-black/20">
        <div className="container px-4 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              AI analytics infrastructure for SaaS products
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Analytics infrastructure is complex. QueryPanel provides AI-powered dashboards out of the box. 
              Our pricing scales simply with your tenant usage, so you only pay as your customer base grows.
            </p>
          </div>
          
          {/* 2. Pricing Table */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-3xl flex flex-col p-6 relative ${
                  plan.highlight 
                    ? "border-2 border-indigo-400/50 bg-indigo-50 shadow-[0_12px_40px_-18px_rgba(99,102,241,0.35)] dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:shadow-[0_0_30px_-10px_rgba(99,102,241,0.2)]" 
                    : "border border-border bg-card shadow-sm dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-sm"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute top-0 inset-x-0 flex justify-center -mt-3">
                    <span className="bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Scale
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.price !== "Custom" && <span className="text-muted-foreground">/mo</span>}
                  </div>
                  <p className="text-sm text-muted-foreground h-12">{plan.desc}</p>
                </div>
                
                <div className="space-y-4 mb-8 flex-1">
                  <div className="pb-4 border-b border-border dark:border-white/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Core Usage</div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Tenants</span>
                      <span className="text-sm font-bold">{plan.limits.tenants}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">AI Charts</span>
                      <span className="text-sm font-bold">{plan.limits.aiCharts}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Platform Limits</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Dashboards</span>
                        <span className="text-sm">{plan.limits.dashboards}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Data Sources</span>
                        <span className="text-sm">{plan.limits.dataSources}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Workspaces</span>
                        <span className="text-sm">{plan.limits.workspaces}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Editors</span>
                        <span className="text-sm">{plan.limits.editors}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Viewers</span>
                        <span className="text-sm">{plan.limits.viewers}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto">
                  {plan.cta === "Contact sales" || plan.cta === "Book demo" ? (
                    <ContactSalesDialog>
                      <Button variant={plan.highlight ? "default" : "outline"} className={`w-full rounded-xl h-12 ${plan.highlight ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "border-border bg-background hover:bg-muted dark:border-white/10 dark:hover:bg-white/10"}`}>
                        {plan.cta}
                      </Button>
                    </ContactSalesDialog>
                  ) : (
                    <Button
                      variant={plan.highlight ? "default" : "secondary"}
                      className={`w-full rounded-xl h-12 ${
                        plan.highlight 
                          ? "bg-indigo-500 hover:bg-indigo-600 text-white" 
                          : "bg-muted text-foreground hover:bg-muted/80 dark:bg-white/10 dark:hover:bg-white/20"
                      }`}
                      onClick={() => {
                        track("pricing_plan_clicked", { plan_name: plan.name, location: "pricing" });
                        trackEvent("Button Clicked", { location: "pricing", button_text: plan.cta, plan_name: plan.name });
                        window.location.href = "/auth/sign-up";
                      }}
                    >
                      {plan.cta}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How Pricing Works & 4. Build vs Buy */}
      <section className="py-16 relative z-10">
        <div className="container px-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-bold mb-6">How Pricing Works</h3>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  <strong className="text-foreground">Platform Plans:</strong> Choose a base plan that fits your scale. Each plan includes a set number of tenants, AI chart credits, and platform features.
                </p>
                <p>
                  <strong className="text-foreground">Included AI Credits:</strong> Every plan comes with a monthly allowance of AI chart generations.
                </p>
                <p>
                  <strong className="text-foreground">Optional Overage:</strong> If you exceed your AI chart limits, you can easily purchase additional usage credits without needing to upgrade your entire platform plan immediately.
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="text-2xl font-bold mb-6">Build vs. Buy</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
                  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-4">Building Internally</h4>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li>• Months of engineering</li>
                    <li>• Ongoing maintenance</li>
                    <li>• AI infrastructure complexity</li>
                    <li>• Multi-tenant challenges</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                  <h4 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-4">Using QueryPanel</h4>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li>• Deploy analytics in hours</li>
                    <li>• Built-in tenant isolation</li>
                    <li>• AI chart generation</li>
                    <li>• Scalable infrastructure</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tenant Dashboard Forking Highlight */}
      <section className="py-16 relative z-10">
        <div className="container px-4 max-w-4xl mx-auto">
          <div className="rounded-3xl border border-indigo-300/50 bg-indigo-50 p-8 md:p-12 text-center relative overflow-hidden dark:border-indigo-500/30 dark:bg-indigo-500/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px]" />
            
            <div className="relative z-10">
              <h3 className="text-2xl md:text-4xl font-bold mb-4">
                The Power of <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Tenant Dashboard Forking</span>
              </h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                QueryPanel allows you to create one dashboard template and automatically generate tenant-specific versions. Each tenant can customize their dashboards without affecting others.
              </p>
              
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 font-mono text-sm">
                <div className="px-6 py-4 rounded-xl border border-border bg-background font-bold dark:border-white/20 dark:bg-black/50">
                  Base Dashboard
                </div>
                <ArrowRight className="w-6 h-6 text-muted-foreground hidden md:block" />
                <div className="flex flex-col gap-3">
                  <div className="px-6 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10">Tenant A Version</div>
                  <div className="px-6 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10">Tenant B Version</div>
                  <div className="px-6 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10">Tenant C Version</div>
                </div>
              </div>
              
              <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> No engineering work</span>
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> No dashboard duplication</span>
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Automatic isolation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Feature Comparison Table */}
      <section className="py-16 relative z-10">
        <div className="container px-4 max-w-5xl mx-auto">
          <h3 className="text-2xl md:text-3xl font-bold mb-10 text-center">Compare Plans</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border dark:border-white/10">
                  <th className="py-4 px-4 font-semibold text-muted-foreground w-1/3">Features</th>
                  <th className="py-4 px-4 font-semibold text-center">Free</th>
                  <th className="py-4 px-4 font-semibold text-center">Starter</th>
                  <th className="py-4 px-4 font-semibold text-center">Growth</th>
                  <th className="py-4 px-4 font-semibold text-center text-indigo-600 dark:text-indigo-400">Scale</th>
                  <th className="py-4 px-4 font-semibold text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr key={feature.name} className="border-b border-border/60 hover:bg-muted/40 transition-colors dark:border-white/5 dark:hover:bg-white/5">
                    <td className="py-4 px-4 font-medium">{feature.name}</td>
                    <td className="py-4 px-4 text-center">
                      {feature.free ? <CheckIcon className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400" /> : <MinusIcon className="w-5 h-5 mx-auto text-muted-foreground/40 dark:text-muted-foreground/30" />}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {feature.starter ? <CheckIcon className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400" /> : <MinusIcon className="w-5 h-5 mx-auto text-muted-foreground/40 dark:text-muted-foreground/30" />}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {feature.growth ? <CheckIcon className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400" /> : <MinusIcon className="w-5 h-5 mx-auto text-muted-foreground/40 dark:text-muted-foreground/30" />}
                    </td>
                    <td className="py-4 px-4 text-center bg-indigo-50 dark:bg-indigo-500/5">
                      {feature.scale ? <CheckIcon className="w-5 h-5 mx-auto text-indigo-600 dark:text-indigo-400" /> : <MinusIcon className="w-5 h-5 mx-auto text-muted-foreground/40 dark:text-muted-foreground/30" />}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {feature.enterprise ? <CheckIcon className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400" /> : <MinusIcon className="w-5 h-5 mx-auto text-muted-foreground/40 dark:text-muted-foreground/30" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section className="py-16 md:py-24 relative z-10">
        <div className="container px-4 max-w-3xl mx-auto">
          <h3 className="text-2xl md:text-3xl font-bold mb-10 text-center">Frequently Asked Questions</h3>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
