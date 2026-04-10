"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { track } from '@vercel/analytics';
import { trackEvent, trackPageView, identifyUser } from "@/lib/analytics/mixpanel";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    trackPageView("Sign Up Page");
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/protected`,
        },
      });
      if (error) throw error;
      
      track("sign-up", {
        used: 'email-password'
      });
      trackEvent("Sign Up", { method: "email-password" });
      identifyUser(email, { email, sign_up_method: "email-password" });
      
      if (data.session) {
        router.push("/protected");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      router.push("/protected");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGithub = async () => {
    const supabase = createClient();
    setIsGithubLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/protected`,
        },
      });

      if (error) throw error;

      track("sign-up", {
        used: 'github'
      });
      trackEvent("Sign Up", { method: "github" });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsGithubLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    const supabase = createClient();
    setIsGoogleLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/protected`,
        },
      });
      if (error) throw error;

      track("sign-up", {
        used: 'google'
      });
      trackEvent("Sign Up", { method: "google" });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-0 shadow-xl bg-background/80 backdrop-blur-sm">
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password" className="text-sm font-medium">Confirm Password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  placeholder="Confirm your password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating account...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4" />
                    Create Account
                  </div>
                )}
              </Button>
              
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
              
              <Button
                type="button"
                variant="outline"
                onClick={signInWithGithub}
                disabled={isGithubLoading || isLoading || isGoogleLoading}
                className="w-full h-11 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Github className="mr-2 h-4 w-4" />
                {isGithubLoading ? "Connecting..." : "Continue with GitHub"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={signInWithGoogle}
                disabled={isGoogleLoading || isLoading || isGithubLoading}
                className="w-full h-11 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.805 10.023h-9.765v3.955h5.627c-.242 1.236-1.457 3.627-5.627 3.627-3.386 0-6.145-2.803-6.145-6.25s2.759-6.25 6.145-6.25c1.927 0 3.222.82 3.963 1.527l2.713-2.638c-1.713-1.6-3.927-2.586-6.676-2.586-5.522 0-10 4.477-10 10s4.478 10 10 10c5.77 0 9.59-4.045 9.59-9.75 0-.654-.07-1.154-.155-1.627z"/><path fill="#34A853" d="M3.545 7.548l3.285 2.409c.895-1.636 2.52-2.682 4.17-2.682 1.27 0 2.41.434 3.31 1.285l2.48-2.48c-1.713-1.6-3.927-2.586-6.676-2.586-3.386 0-6.145 2.803-6.145 6.25 0 1.02.242 1.98.68 2.824z"/><path fill="#FBBC05" d="M12 22c2.749 0 4.963-.91 6.627-2.477l-3.09-2.527c-.895.6-2.045.977-3.537.977-2.707 0-5.01-1.82-5.827-4.273l-3.285 2.409c1.636 3.227 5.09 5.391 9.112 5.391z"/><path fill="#EA4335" d="M21.805 10.023h-9.765v3.955h5.627c-.242 1.236-1.457 3.627-5.627 3.627-3.386 0-6.145-2.803-6.145-6.25s2.759-6.25 6.145-6.25c1.927 0 3.222.82 3.963 1.527l2.713-2.638c-1.713-1.6-3.927-2.586-6.676-2.586-5.522 0-10 4.477-10 10s4.478 10 10 10c5.77 0 9.59-4.045 9.59-9.75 0-.654-.07-1.154-.155-1.627z"/></svg>
                {isGoogleLoading ? "Connecting..." : "Continue with Google"}
              </Button>
            </div>
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href="/auth/login" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
