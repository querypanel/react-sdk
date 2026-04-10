"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BrainIcon,
  ScrollTextIcon,
  TableIcon,
  ServerIcon,
  LayoutDashboardIcon,
  HomeIcon,
  KeyIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import favicon from '@/app/favicon.svg';
// reports removed

const navigation = [
  {
    name: 'Home',
    href: '/dashboard/home',
    icon: HomeIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Dashboards',
    href: '/dashboard/dashboards',
    icon: LayoutDashboardIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Schema Manager',
    href: '/dashboard/schema-manager',
    icon: TableIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Datasources',
    href: '/dashboard/datasources',
    icon: ServerIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Knowledge base',
    href: '/dashboard/knowledge-base',
    icon: BrainIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Audit Logs',
    href: '/dashboard/audit-logs',
    icon: ScrollTextIcon,
    gradient: 'from-purple-600 to-indigo-600'
  },
  {
    name: 'Keys',
    href: '/dashboard/keys',
    icon: KeyIcon,
    gradient: 'from-gray-600 to-slate-600'
  }
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({
  isCollapsed = false,
  onToggleCollapse,
  onNavigate,
  className,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn(
      "flex h-full flex-col bg-gradient-to-b from-purple-50/80 via-blue-50/80 to-indigo-50/80 dark:from-purple-950/20 dark:via-blue-950/20 dark:to-indigo-950/20 border-r border-purple-200/50 dark:border-purple-800/50 backdrop-blur-sm transition-all duration-300",
      isCollapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Enhanced Header */}
      <div className="flex h-16 items-center justify-between border-b border-purple-200/50 bg-white/50 px-4 backdrop-blur-sm dark:border-purple-800/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center">
            <Image src={favicon} alt="QueryPanel" width={24} height={24} />
          </div>
          {!isCollapsed && (
            <h1 className="truncate font-bold text-lg bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              QueryPanel
            </h1>
          )}
        </div>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden min-[800px]:inline-flex hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <LayoutDashboardIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </Button>
        )}
      </div>

      {/* Enhanced Navigation */}
      <nav className="flex-1 p-4 space-y-4">
        {/* Main Navigation */}
        <div className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.name} href={item.href} onClick={onNavigate}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full h-12 rounded-lg transition-colors duration-200",
                    isCollapsed
                      ? "justify-center gap-0 px-0"
                      : "justify-start gap-3 px-3",
                    isActive
                      ? cn(
                          `bg-gradient-to-r ${item.gradient} text-white shadow-md`,
                          // Ghost applies hover:bg-accent; transparent keeps the gradient visible
                          "hover:!bg-transparent hover:brightness-[1.06]"
                        )
                      : "hover:bg-purple-100/50 dark:hover:bg-purple-900/30 hover:shadow-sm"
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                  <div
                    className={cn(
                      "flex items-center",
                      !isCollapsed && "gap-3",
                      isCollapsed && "justify-center"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-lg p-2 transition-colors duration-200",
                        isActive
                          ? "bg-white/15"
                          : "bg-purple-100/50 dark:bg-purple-900/30 group-hover:bg-purple-200/50 dark:group-hover:bg-purple-800/30"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-transform duration-200",
                          isActive
                            ? "text-white"
                            : "text-purple-600 dark:text-purple-400 group-hover:scale-110"
                        )}
                      />
                    </div>
                    {!isCollapsed && (
                      <span className="text-sm font-semibold">{item.name}</span>
                    )}
                  </div>
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-purple-200/50 dark:border-purple-800/50 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm">
        {!isCollapsed && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground font-medium">
              Powered by AI
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold">
              QueryPanel v1.0
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 