"use client";

import { useState, useEffect } from "react";
import { Link, usePathname } from "@/lib/router";
import { SITE_NAME } from "@/lib/site";
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Info,
  LayoutGrid,
  Layers,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

// Widths are sourced from CSS vars (see src/app/globals.css :root).
// Override --sidebar-width-expanded / --sidebar-width-collapsed to retheme.

interface NavItem {
  href: string;
  label: string;
  icon: typeof PenLine;
  dividerAfter?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  // Scope = 「何を演習対象とするか」の入口。一番上。
  { href: "/scopes", label: "Scopes", icon: Target },
  { href: "/plan", label: "Roadmap", icon: CalendarRange },
  { href: "/habits", label: "Habits", icon: CheckCircle2, badge: "beta" },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/digest", label: "Digest", icon: Newspaper, dividerAfter: true },
  { href: "/problems", label: "Problems", icon: BookOpen },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/masters", label: "Masters", icon: LayoutGrid },
  { href: "/about", label: "About", icon: Info },
];

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 p-2 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            // More specific nav items take priority over shorter prefix matches
            const active =
              pathname.startsWith(item.href) &&
              !navItems.some(
                (other) =>
                  other.href.length > item.href.length &&
                  other.href.startsWith(item.href) &&
                  pathname.startsWith(other.href),
              );
            return (
              <div key={item.href}>
                <Link
                  to={item.href}
                  title={item.label}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center rounded-md pl-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <div className="relative shrink-0">
                    <item.icon className="size-4" />
                  </div>
                  <span
                    className={cn(
                      "whitespace-nowrap transition-opacity duration-200",
                      collapsed
                        ? "opacity-0 w-0 overflow-hidden"
                        : "opacity-100 ml-3",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && !collapsed && (
                    <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
                {item.dividerAfter && <div className="border-t border-sidebar-border/50" />}
              </div>
            );
          })}
        </div>
      </nav>

      <UserMenu collapsed={collapsed} />
    </>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)";

  return (
    <aside
      className="hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-300"
      style={{ width: sidebarWidth }}
    >
      <div className="flex items-center border-b border-sidebar-border px-3 gap-2" style={{ height: "var(--header-height-mobile)" }}>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex shrink-0 size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
        <span
          className={cn(
            "truncate text-lg font-semibold text-primary whitespace-nowrap transition-opacity duration-200",
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100",
          )}
        >
          {SITE_NAME}
        </span>
      </div>

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
