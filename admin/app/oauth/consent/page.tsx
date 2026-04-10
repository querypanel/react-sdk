import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import favicon from "@/app/favicon.svg";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ExternalLink } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ authorization_id?: string }>;
}

const scopeDescriptions: Record<string, string> = {
  openid: "Verify your identity",
  email: "View your email address",
  profile: "View your profile information",
  phone: "View your phone number",
};

export default async function ConsentPage({ searchParams }: PageProps) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return (
      <ErrorLayout>
        <p>Missing authorization_id parameter</p>
      </ErrorLayout>
    );
  }

  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login, preserving authorization_id
    redirect(
      `/auth/login?redirect=/oauth/consent?authorization_id=${authorizationId}`
    );
  }

  // Get authorization details using the authorization_id
  const { data: authDetails, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !authDetails) {
    return (
      <ErrorLayout>
        <p>{error?.message || "Invalid authorization request"}</p>
      </ErrorLayout>
    );
  }

  // If user already consented, redirect immediately
  if (!("authorization_id" in authDetails)) {
    redirect(authDetails.redirect_url);
  }

  const scopes = authDetails.scope?.trim()
    ? authDetails.scope.split(" ").filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 flex items-center justify-center border-2 border-purple-500/30 dark:border-purple-400/30 rounded-xl">
                <Image src={favicon} alt="QueryPanel" width={32} height={32} />
              </div>
            </div>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-xl">
                Authorize {authDetails.client.name}
              </CardTitle>
              <CardDescription>
                This application wants to access your QueryPanel account
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Client info */}
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Application</span>
                  <span className="font-medium">{authDetails.client.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Redirect to</span>
                  <span className="font-mono text-xs truncate max-w-[200px] flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {new URL(authDetails.redirect_uri).host}
                  </span>
                </div>
              </div>

              {/* Scopes */}
              {scopes.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    This will allow the application to:
                  </p>
                  <ul className="space-y-2">
                    {scopes.map((scope) => (
                      <li
                        key={scope}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                        <span>{scopeDescriptions[scope] || scope}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* User info */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">
                    {user.email}
                  </span>
                </p>
              </div>
            </CardContent>

            <CardFooter>
              <form
                action="/api/oauth/decision"
                method="POST"
                className="flex gap-3 w-full"
              >
                <input
                  type="hidden"
                  name="authorization_id"
                  value={authorizationId}
                />
                <Button
                  type="submit"
                  name="decision"
                  value="deny"
                  variant="outline"
                  className="flex-1"
                >
                  Deny
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="flex-1"
                >
                  Authorize
                </Button>
              </form>
            </CardFooter>
          </Card>

          <p className="text-xs text-center text-muted-foreground mt-4">
            By authorizing, you allow this app to access your data according to
            its terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 flex items-center justify-center border-2 border-purple-500/30 dark:border-purple-400/30 rounded-xl">
                <Image src={favicon} alt="QueryPanel" width={32} height={32} />
              </div>
            </div>
          </div>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-destructive">
                Authorization Error
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              {children}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
