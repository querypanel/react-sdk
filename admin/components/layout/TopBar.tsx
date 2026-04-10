"use client";

import {
  MenuIcon,
  SettingsIcon,
  BarChart3Icon,
  KeyIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { UserProfile } from "@/components/UserProfile";
import { useAuth } from "@/lib/context/AuthContext";

interface TopBarProps {
  onToggleSidebar?: () => void;
  title?: string;
  subtitle?: string;
}

function ClientAuthButton() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="w-8 h-8 animate-pulse bg-muted rounded"></div>;
  }

  return user ? (
    <UserProfile />
  ) : (
    <div className="flex gap-2">
      <Button
        asChild
        size="sm"
        variant="outline"
        className="bg-white/50 dark:bg-gray-900/50 border-purple-200/70 dark:border-purple-800/70 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
      >
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 dark:from-purple-500 dark:to-indigo-500 dark:hover:from-purple-600 dark:hover:to-indigo-600"
      >
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}

export function TopBar({ onToggleSidebar, title, subtitle }: TopBarProps) {
  return (
    <header className="bg-gradient-to-r from-purple-50/80 via-blue-50/80 to-indigo-50/80 dark:from-purple-950/20 dark:via-blue-950/20 dark:to-indigo-950/20 border-b border-purple-200/50 dark:border-purple-800/50 backdrop-blur-sm">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      {/* Left Section */}
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="shrink-0 min-[800px]:hidden hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
        >
          <MenuIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </Button>

        {title && (
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 p-2 dark:from-purple-900/50 dark:to-indigo-900/50 sm:block">
              <BarChart3Icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-base font-bold text-transparent sm:text-lg">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-purple-100/50 dark:hover:bg-purple-900/30 group"
            >
              <SettingsIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-purple-200/50 dark:border-purple-800/50"
          >
            <DropdownMenuItem
              asChild
              className="hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
            >
              <Link href="/dashboard/keys">
                <KeyIcon className="w-4 h-4 mr-2 text-purple-600 dark:text-purple-400" />
                Keys
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeSwitcher />

        <ClientAuthButton />
      </div>
      </div>
    </header>
  );
}
