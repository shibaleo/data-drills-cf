"use client";

import { useState, useEffect } from "react";
import { Link, usePathname } from "@/lib/router";
import { SITE_NAME } from "@/lib/site";
import {
  CalendarDays,
  Clock,
  FileText,
  Info,
  LayoutGrid,
  Layers,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  TableProperties,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/use-project";
import { useScheduleList } from "@/hooks/queries/use-schedule";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleKeys } from "@/hooks/queries/use-schedule";
import { UserMenu } from "./user-menu";

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 56;

interface NavItem {
  href: string;
  label: string;
  icon: typeof PenLine;
  dividerAfter?: boolean;
  Badge?: React.ComponentType;
}

/* ── Overdue badge ── */

function OverdueBadge() {
  const { currentProject } = useProject();
  const qc = useQueryClient();
  const { data = [] } = useScheduleList(currentProject?.id);
  const count = data.filter((r) => r.daysUntil <= 0).length;

  // Legacy "schedule-changed" event — re-invalidate to pick up updates.
  useEffect(() => {
    const invalidate = () => {
      if (currentProject) {
        qc.invalidateQueries({ queryKey: scheduleKeys.list(currentProject.id) });
      }
    };
    window.addEventListener("schedule-changed", invalidate);
    return () => window.removeEventListener("schedule-changed", invalidate);
  }, [qc, currentProject]);

  if (count <= 0) return null;
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const navItems: NavItem[] = [
  { href: "/schedule", label: "Schedule", icon: CalendarDays, Badge: OverdueBadge, dividerAfter: true },
  { href: "/problems", label: "Problems", icon: TableProperties },
  { href: "/answers", label: "Answers", icon: PenLine },
  { href: "/timeline", label: "Timeline", icon: Clock, dividerAfter: true },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/notes", label: "Notes", icon: FileText, dividerAfter: true },
  { href: "/topics", label: "Topics", icon: List },
  { href: "/tags", label: "Tags", icon: Tag, dividerAfter: true },
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
                    {item.Badge && <item.Badge />}
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
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <aside
      className="hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-300"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-14 items-center border-b border-sidebar-border px-3 gap-2">
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
