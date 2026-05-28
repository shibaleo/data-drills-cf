"use client";

import { useState, useEffect } from "react";
import { Link, usePathname } from "@/lib/router";
import { SITE_NAME } from "@/lib/site";
import {
  History,
  Info,
  Inbox,
  LayoutGrid,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Repeat,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/use-project";
import { useReviewList } from "@/hooks/queries/use-review";
import { useFilterPrefs } from "@/hooks/queries/use-filter-prefs";
import { useBacklogTodayCount } from "@/hooks/queries/use-backlog";
import { useQueryClient } from "@tanstack/react-query";
import { reviewKeys } from "@/hooks/queries/use-review";
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
  const { data = [] } = useReviewList(currentProject?.id);
  const { data: prefs } = useFilterPrefs(currentProject?.id);
  const rev = prefs?.review ?? {};
  const subjSet = new Set(rev.subjectIds ?? []);
  const lvlSet = new Set(rev.levelIds ?? []);
  const stSet = new Set(rev.lastStatuses ?? []);
  const count = data.filter((r) => {
    if (r.answerCount === 0 || r.daysUntil !== 0) return false;
    if (subjSet.size > 0 && (!r.subjectId || !subjSet.has(r.subjectId))) return false;
    if (lvlSet.size > 0 && (!r.levelId || !lvlSet.has(r.levelId))) return false;
    if (stSet.size > 0 && !stSet.has(r.lastStatus)) return false;
    return true;
  }).length;

  useEffect(() => {
    const invalidate = () => {
      if (currentProject) {
        qc.invalidateQueries({ queryKey: reviewKeys.list(currentProject.id) });
      }
    };
    window.addEventListener("review-changed", invalidate);
    return () => window.removeEventListener("review-changed", invalidate);
  }, [qc, currentProject]);

  if (count <= 0) return null;
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function BacklogBadge() {
  const { currentProject } = useProject();
  const { data: count = 0 } = useBacklogTodayCount(currentProject?.id);
  if (count <= 0) return null;
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const navItems: NavItem[] = [
  { href: "/review", label: "Review", icon: Repeat, Badge: OverdueBadge },
  { href: "/backlog", label: "Backlog", icon: Inbox, Badge: BacklogBadge },
  { href: "/throughput", label: "Throughput", icon: History, dividerAfter: true },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
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
