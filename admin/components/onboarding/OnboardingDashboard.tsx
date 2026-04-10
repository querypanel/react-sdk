"use client";

import Link from "next/link";
import OrganizationCard from "@/components/organization/OrganizationCard";
import TeamManagement from "@/components/organization/TeamManagement";
import SDKDocsButton from "@/components/organization/SDKDocsButton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import HighlightedCode from "@/components/ui/HighlightedCode";
import { Button } from "@/components/ui/button";
import {
  PlayIcon,
  UsersIcon,
  KeyIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics/mixpanel";

interface OnboardingDashboardProps {
  organization: { id: string; name: string };
  onContinueOnboarding: () => void;
}

const checklist = [
  {
    title: "Copy your private key",
    description:
      "A default SDK key was created with your workspace. Store the private key securely.",
    href: "/dashboard/keys",
    icon: KeyIcon,
    cta: "Keys",
  },
  {
    title: "Sample datasource",
    description:
      "Try charts and SQL without wiring your own database first. Add production datasources anytime.",
    href: "/dashboard/datasources",
    icon: DatabaseIcon,
    cta: "Datasources",
  },
  {
    title: "Build a dashboard",
    description: "Create blocks, run queries, and preview visualizations.",
    href: "/dashboard/dashboards",
    icon: LayoutDashboardIcon,
    cta: "Dashboards",
  },
] as const;

export default function OnboardingDashboard({
  organization,
  onContinueOnboarding,
}: OnboardingDashboardProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
            <UsersIcon className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              Home
            </h1>
            <p className="text-muted-foreground">
              Your workspace includes a signing key and sample data — jump in or
              finish the guided setup.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            trackEvent("Onboarding Continued", { source: "dashboard_header" });
            onContinueOnboarding();
          }}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-blue-500 sm:w-auto"
        >
          <PlayIcon className="w-4 h-4 mr-2" />
          Guided setup
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <OrganizationCard organization={organization} />
          <TeamManagement />

          <Card className="border-purple-200/60 dark:border-purple-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2Icon className="w-5 h-5 text-green-600" />
                Getting started
              </CardTitle>
              <CardDescription>
                Everything below was set up when you created this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {checklist.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.href}
                    className="flex gap-3 rounded-lg border bg-card/50 p-3"
                  >
                    <div className="mt-0.5 text-muted-foreground">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium leading-tight">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                      <Button asChild variant="link" className="h-auto p-0 text-purple-600">
                        <Link
                          href={item.href}
                          onClick={() =>
                            trackEvent("Onboarding Checklist Click", {
                              href: item.href,
                            })
                          }
                        >
                          Open {item.cta}
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="relative overflow-hidden border-blue-200 dark:border-blue-800 h-fit">
          <CardHeader>
            <CardTitle>Your own data & embed</CardTitle>
            <CardDescription>
              When you&apos;re ready for production, install the SDK, set env
              vars from Keys, and attach your databases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Install
              </div>
              <HighlightedCode code={`npm i @querypanel/node-sdk`} />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Environment
              </div>
              <div className="text-sm font-mono space-y-1 text-muted-foreground bg-muted/50 p-3 rounded">
                <div>QUERYPANEL_URL=https://api.querypanel.io</div>
                <div>
                  QUERYPANEL_SERVICE_TOKEN=&lt;private key from Keys&gt;
                </div>
                <div>QUERYPANEL_WORKSPACE_ID={organization.id}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Example
              </div>
              <HighlightedCode
                code={`import { QueryPanelSdkAPI } from "@querypanel/node-sdk";

const qp = new QueryPanelSdkAPI(
  process.env.QUERYPANEL_URL!,
  process.env.QUERYPANEL_SERVICE_TOKEN!,
  process.env.QUERYPANEL_WORKSPACE_ID!,
);

qp.attachPostgres("my_db", createClientFn, {
  database: "analytics",
  tenantFieldName: "tenant_id",
  enforceTenantIsolation: true,
});

await qp.syncSchema("analytics", { tenantId: "tenant_123" });

const response = await qp.ask("Revenue by country", {
  tenantId: "tenant_123",
  database: "analytics",
});`}
              />
            </div>
            <SDKDocsButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
