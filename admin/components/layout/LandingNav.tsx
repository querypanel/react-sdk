"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Github, Menu } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import favicon from "@/app/favicon.svg";
import { track } from "@vercel/analytics";
import { trackEvent } from "@/lib/analytics/mixpanel";

type GitHubRepoResponse = { stargazers_count: number };

export default function LandingNav() {
  const [githubStars, setGithubStars] = React.useState<number | null>(null);
  const [reactSdkStars, setReactSdkStars] = React.useState<number | null>(null);
  const formatStarCount = React.useCallback((count: number): string => {
    if (count >= 1000) {
      const rounded = count >= 10000 ? Math.round(count / 1000) : Math.round((count / 1000) * 10) / 10;
      return `${rounded}K`;
    }
    return `${count}`;
  }, []);

  React.useEffect(() => {
    fetch("https://api.github.com/repos/querypanel/node-sdk")
      .then(async (res) => (res.ok ? (await res.json() as GitHubRepoResponse) : null))
      .then((data) => {
        if (data && typeof data.stargazers_count === "number") {
          setGithubStars(data.stargazers_count);
        }
      })
      .catch(() => { /* ignore */ });
    fetch("https://api.github.com/repos/querypanel/react-sdk")
      .then(async (res) => (res.ok ? (await res.json() as GitHubRepoResponse) : null))
      .then((data) => {
        if (data && typeof data.stargazers_count === "number") {
          setReactSdkStars(data.stargazers_count);
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  const trackBlog = () => {
    track("nav_button_clicked", { location: "navbar", button_text: "Blog", destination: "/blog" });
    trackEvent("Button Clicked", { location: "navbar", button_text: "Blog", destination: "/blog" });
  };

  const trackCompare = () => {
    track("nav_button_clicked", { location: "navbar", button_text: "Compare", destination: "/compare" });
    trackEvent("Button Clicked", { location: "navbar", button_text: "Compare", destination: "/compare" });
  };

  const trackSignIn = () => {
    track("nav_button_clicked", { location: "navbar", button_text: "Sign In", destination: "/auth/login" });
    trackEvent("Button Clicked", { location: "navbar", button_text: "Sign In", destination: "/auth/login" });
  };

  const trackGetStarted = () => {
    track("nav_button_clicked", { location: "navbar", button_text: "Get Started", destination: "/auth/sign-up" });
    trackEvent("Button Clicked", { location: "navbar", button_text: "Get Started", destination: "/auth/sign-up" });
  };

  const trackGithub = (repo: "node-sdk" | "react-sdk") => {
    track("github_button_clicked", { location: "navbar", repo });
    trackEvent("GitHub Button Clicked", { location: "navbar", destination: repo });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-background/50 backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-none md:flex-none md:gap-8">
          <button
            type="button"
            className="group flex min-w-0 max-w-full cursor-pointer items-center gap-2"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              <Image src={favicon} alt="QueryPanel" width={32} height={32} />
            </div>
            <span className="truncate bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-lg font-bold tracking-tight text-transparent sm:text-xl">
              QueryPanel
            </span>
          </button>
          <Link
            href="/blog"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:inline-block"
            onClick={trackBlog}
          >
            Blog
          </Link>
          <Link
            href="/compare"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:inline-block"
            onClick={trackCompare}
          >
            Compare
          </Link>
        </div>

        {/* Desktop: full nav row — no horizontal cramming */}
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <ThemeSwitcher />
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/querypanel/node-sdk"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:bg-white/10 dark:bg-white/5"
              aria-label="Star querypanel/node-sdk on GitHub"
              onClick={() => trackGithub("node-sdk")}
            >
              <Github className="w-3.5 h-3.5" />
              <span className="font-medium">node</span>
              <span className="text-muted-foreground/80">{githubStars !== null ? formatStarCount(githubStars) : "★"}</span>
            </a>
            <a
              href="https://github.com/querypanel/react-sdk"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:bg-white/10 dark:bg-white/5"
              aria-label="Star querypanel/react-sdk on GitHub"
              onClick={() => trackGithub("react-sdk")}
            >
              <Github className="w-3.5 h-3.5" />
              <span className="font-medium">react</span>
              <span className="text-muted-foreground/80">{reactSdkStars !== null ? formatStarCount(reactSdkStars) : "★"}</span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-sm font-medium hover:bg-white/5" onClick={() => { trackSignIn(); window.location.href = "/auth/login"; }}>
              Sign In
            </Button>
            <Button
              className="bg-foreground text-background shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all hover:scale-105 hover:bg-foreground/90 dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.5)]"
              onClick={() => { trackGetStarted(); window.location.href = "/auth/sign-up"; }}
            >
              Get Started
            </Button>
          </div>
        </div>

        {/* Mobile & tablet: compact row + overflow menu */}
        <div className="flex shrink-0 items-center gap-1 md:hidden">
          <ThemeSwitcher />
          <Button
            className="h-9 shrink-0 px-3 text-sm bg-foreground text-background hover:bg-foreground/90"
            onClick={() => { trackGetStarted(); window.location.href = "/auth/sign-up"; }}
          >
            Get Started
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/blog" onClick={trackBlog}>
                  Blog
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/compare" onClick={trackCompare}>
                  Compare
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  trackSignIn();
                  window.location.href = "/auth/login";
                }}
              >
                Sign In
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/querypanel/node-sdk"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackGithub("node-sdk")}
                >
                  <Github className="mr-2 h-4 w-4" />
                  node SDK
                  <span className="ml-auto text-xs text-muted-foreground">{githubStars !== null ? formatStarCount(githubStars) : "—"}</span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/querypanel/react-sdk"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackGithub("react-sdk")}
                >
                  <Github className="mr-2 h-4 w-4" />
                  react SDK
                  <span className="ml-auto text-xs text-muted-foreground">{reactSdkStars !== null ? formatStarCount(reactSdkStars) : "—"}</span>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
