"use client";

/** /stats — canonical scope.id への redirect 専用 (Plan A). */

import { useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { usePageTitle } from "@/lib/page-context";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function StatsEntryPage() {
  usePageTitle("Stats");
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const navigate = useNavigate();
  useEffect(() => {
    const target = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (target) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/stats/$scope_id" as string, params: { scope_id: target }, replace: true });
    } else {
      navigate({ to: "/scopes" as string, replace: true });
    }
  }, [search.scope_id, navigate]);
  return <div className="p-4 text-muted-foreground text-sm">Redirecting…</div>;
}
