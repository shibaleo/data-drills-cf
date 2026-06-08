"use client";

/**
 * /stats — ?scope_id= 駆動の入口。/review と同じ bridge パターン。
 */

import { useEffect } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useField } from "@/hooks/use-project";
import { useStatsScopesList } from "@/hooks/queries/use-stats-scopes";
import { usePageTitle } from "@/lib/page-context";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function StatsEntryPage() {
  usePageTitle("Stats");
  const { currentField } = useField();
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const navigate = useNavigate();
  const { data: statsScopes = [], isLoading } = useStatsScopesList(currentField?.id);

  useEffect(() => {
    if (isLoading || !currentField) return;
    const queryScopeId = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (!queryScopeId) return;
    const match = statsScopes.find((rs) => rs.scope_id === queryScopeId);
    if (match) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/stats/$scope_id" as string, params: { scope_id: match.id }, replace: true });
    }
  }, [search.scope_id, statsScopes, isLoading, currentField, navigate]);

  if (!currentField) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}
      <div className="text-xs text-muted-foreground mb-2">Select a scope to view its stats:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statsScopes.map((s) => (
          <Link key={s.id} to="/stats/$scope_id" params={{ scope_id: s.id }}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">revision {s.revision}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
