"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2Icon,
  KeyIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import OrganizationForm from "@/components/organization/OrganizationForm";
import SDKDocsButton from "@/components/organization/SDKDocsButton";
import HighlightedCode from "@/components/ui/HighlightedCode";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics/mixpanel";

interface Organization {
  id: string;
  name: string;
}

interface OnboardingStepperProps {
  initialOrganization?: Organization | null;
  onSkip?: () => void;
  onComplete?: () => void;
}

/** Matches the auto-provisioned sample datasource display name when enabled on the server. */
const SAMPLE_DATASOURCE_NAME = "Sample database";

const STEPS = [
  {
    id: "create-org",
    title: "Workspace",
    description: "Create your workspace",
    icon: Building2Icon,
  },
  {
    id: "keys",
    title: "Signing key",
    description: "Default SDK key",
    icon: KeyIcon,
  },
  {
    id: "sample-data",
    title: "Sample data",
    description: "Try without your DB",
    icon: DatabaseIcon,
  },
  {
    id: "dashboards",
    title: "Dashboards",
    description: "Build your first chart",
    icon: LayoutDashboardIcon,
  },
] as const;

export default function OnboardingStepper({
  initialOrganization,
  onSkip,
  onComplete,
}: OnboardingStepperProps) {
  const [currentStep, setCurrentStep] = useState(() =>
    initialOrganization ? 1 : 0
  );
  const [organization, setOrganization] = useState<Organization | null>(
    initialOrganization || null
  );
  const [showByoKeyHelp, setShowByoKeyHelp] = useState(false);
  const [hasCopiedInstall, setHasCopiedInstall] = useState(false);
  const [hasCopiedReactInstall, setHasCopiedReactInstall] = useState(false);

  useEffect(() => {
    setOrganization(initialOrganization || null);
    if (initialOrganization) {
      setCurrentStep(1);
    } else {
      setCurrentStep(0);
    }
  }, [initialOrganization]);

  const handleOrgCreated = (org: Organization) => {
    localStorage.removeItem("onboarding_skipped");
    setOrganization(org);
    trackEvent("Onboarding Step Completed", {
      step: "Create Workspace",
      organization_id: org.id,
    });
    setCurrentStep(1);
  };

  const copyToClipboard = async (
    text: string,
    setCopiedState: (val: boolean) => void
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(true);
      trackEvent("Onboarding Code Copied", { type: "install_command" });
      setTimeout(() => setCopiedState(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to QueryPanel</h1>
          <p className="text-muted-foreground mt-2">Let&apos;s get your workspace set up.</p>
        </div>
        {onSkip && (
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip to home
            <ChevronRightIcon className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={cn(
                "relative pl-14 py-4 transition-opacity duration-300",
                isUpcoming && "opacity-50"
              )}
            >
              {/* Vertical line connecting steps */}
              {index !== STEPS.length - 1 && (
                <div
                  className={cn(
                    "absolute left-[1.625rem] top-14 bottom-[-1rem] w-0.5 z-0",
                    isCompleted ? "bg-purple-600" : "bg-border"
                  )}
                />
              )}

              {/* Step Icon */}
              <div
                className={cn(
                  "absolute left-1 top-4 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                  isCompleted
                    ? "bg-purple-600 border-purple-600 text-white"
                    : isCurrent
                    ? "bg-background border-purple-600 text-purple-600"
                    : "bg-background border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckIcon className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>

              {/* Step Header */}
              <div className="mb-4">
                <h3
                  className={cn(
                    "text-xl font-semibold",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </h3>
                {isUpcoming && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.description}
                  </p>
                )}
              </div>

              {/* Step Content */}
              {isCurrent && (
                <Card className="border-purple-200/60 dark:border-purple-900/40 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                  <CardContent className="p-6">
                    {index === 0 && (
                      <div className="space-y-6">
                        <p className="text-muted-foreground">
                          Glad you&apos;re here. Name your workspace — we&apos;ll add a
                          signing key and{" "}
                          <span className="font-medium text-foreground">
                            {SAMPLE_DATASOURCE_NAME}
                          </span>{" "}
                          so you can try dashboards; plug in your own DB anytime.
                        </p>
                        <div className="bg-muted/30 p-6 rounded-xl border border-border">
                          <OrganizationForm onCreated={handleOrgCreated} />
                        </div>
                      </div>
                    )}

                    {index === 1 && organization && (
                      <div className="space-y-6">
                        <p className="text-muted-foreground">
                          Hey 👊 Your workspace is ready. We set up a default signing key
                          so you can get started quickly. If you need a new key pair for your
                          integration, open the `Keys` menu and generate one there (save the
                          private key in your secrets manager).
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            asChild
                            className="bg-gradient-to-r from-purple-600 to-blue-600"
                          >
                            <Link
                              href="/dashboard/keys"
                              onClick={() =>
                                trackEvent("Onboarding Step Action", {
                                  step: "Signing key",
                                  action: "open_keys",
                                })
                              }
                            >
                              Open Keys
                              <ChevronRightIcon className="w-4 h-4 ml-1" />
                            </Link>
                          </Button>
                        </div>

                        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm">
                          <button
                            type="button"
                            className="font-medium text-foreground hover:underline"
                            onClick={() => setShowByoKeyHelp((v) => !v)}
                          >
                            {showByoKeyHelp ? "Hide" : "Advanced:"} use your own RSA key
                            pair
                          </button>
                          {showByoKeyHelp && (
                            <div className="mt-4 space-y-3 text-left text-muted-foreground">
                              <p>
                                Generate a key pair locally, then upload the{" "}
                                <strong>public</strong> key on the Keys page.
                              </p>
                              <HighlightedCode
                                code={`openssl genrsa -out private.pem 2048\nopenssl rsa -in private.pem -outform PEM -pubout -out public.pem`}
                              />
                              <Button asChild variant="outline" size="sm">
                                <Link href="/dashboard/keys">Upload on Keys</Link>
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={() => {
                              trackEvent("Onboarding Step Completed", {
                                step: "Signing key",
                              });
                              setCurrentStep(2);
                            }}
                            className="bg-gradient-to-r from-purple-600 to-blue-600"
                          >
                            I&apos;ve saved my private key
                            <ChevronRightIcon className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {index === 2 && organization && (
                      <div className="space-y-6">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {SAMPLE_DATASOURCE_NAME}
                          </span>{" "}
                          is already on this workspace so you can explore charts and SQL
                          without connecting your own database first. Optionally sync
                          schema from the Schema manager when you&apos;re ready for AI
                          assistance against that data.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                          <Button asChild variant="outline">
                            <Link
                              href="/dashboard/datasources"
                              onClick={() =>
                                trackEvent("Onboarding Step Action", {
                                  step: "Sample data",
                                  action: "datasources",
                                })
                              }
                            >
                              View datasources
                            </Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link
                              href="/dashboard/schema-manager"
                              onClick={() =>
                                trackEvent("Onboarding Step Action", {
                                  step: "Sample data",
                                  action: "schema_manager",
                                })
                              }
                            >
                              Schema manager
                            </Link>
                          </Button>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={() => {
                              trackEvent("Onboarding Step Completed", {
                                step: "Sample data",
                              });
                              setCurrentStep(3);
                            }}
                            className="bg-gradient-to-r from-purple-600 to-blue-600"
                          >
                            Continue
                            <ChevronRightIcon className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {index === 3 && organization && (
                      <div className="space-y-6">
                        <p className="text-muted-foreground">
                          Create a dashboard, add charts, and run queries against your
                          sample datasource — or connect your own database when you move
                          to production.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            asChild
                            className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500"
                          >
                            <Link
                              href="/dashboard/dashboards"
                              onClick={() =>
                                trackEvent("Onboarding Step Action", {
                                  step: "Dashboards",
                                  action: "open_dashboards",
                                })
                              }
                            >
                              Open dashboards
                              <ChevronRightIcon className="w-4 h-4 ml-2" />
                            </Link>
                          </Button>
                        </div>

                        <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-4">
                          <p className="text-sm font-medium text-foreground">
                            Integrate in your app (optional)
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Install the Node SDK when you want to attach your own
                            Postgres or ClickHouse and issue embed tokens.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            For dashboarding, install the React SDK to render the
                            QueryPanel UI in your app.
                          </p>

                          <div className="flex flex-col gap-4 min-w-0">
                            <div className="space-y-1.5 min-w-0">
                              <p className="text-xs font-medium text-muted-foreground">
                                React SDK (dashboards)
                              </p>
                              <div className="relative group w-full min-w-0">
                                <HighlightedCode code="npm install @querypanel/react-sdk" />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() =>
                                    copyToClipboard(
                                      "npm install @querypanel/react-sdk",
                                      setHasCopiedReactInstall
                                    )
                                  }
                                >
                                  {hasCopiedReactInstall ? (
                                    <CheckIcon className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <CopyIcon className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-1.5 min-w-0">
                              <p className="text-xs font-medium text-muted-foreground">
                                Node SDK (embed tokens, DB attach)
                              </p>
                              <div className="relative group w-full min-w-0">
                                <HighlightedCode code="npm install @querypanel/node-sdk" />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() =>
                                    copyToClipboard(
                                      "npm install @querypanel/node-sdk",
                                      setHasCopiedInstall
                                    )
                                  }
                                >
                                  {hasCopiedInstall ? (
                                    <CheckIcon className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <CopyIcon className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div>
                            <SDKDocsButton />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button
                            onClick={() => {
                              trackEvent("Onboarding Completed");
                              onComplete?.();
                            }}
                            variant="secondary"
                          >
                            Finish setup
                            <ChevronRightIcon className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
