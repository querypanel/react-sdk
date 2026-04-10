"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { OrganizationProvider } from "@/lib/context/OrganizationContext";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setMobileSidebarOpen((previous) => !previous);
  };

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <OrganizationProvider>
      <div className="h-screen flex overflow-hidden bg-background">
        <aside className="hidden shrink-0 min-[800px]:block">
          <Sidebar
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((previous) => !previous)}
          />
        </aside>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 min-[800px]:hidden",
            mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-72 transition-transform duration-300 min-[800px]:hidden",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar
            className="h-full shadow-2xl"
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            onToggleSidebar={toggleSidebar}
            title={title}
            subtitle={subtitle}
          />

          <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </OrganizationProvider>
  );
}