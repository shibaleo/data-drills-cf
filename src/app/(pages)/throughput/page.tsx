"use client";

/**
 * /throughput — ?scope_id= 駆動の入口。/review と同じ bridge パターン。
 */

import { useEffect } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useThroughputScopesList } from "@/hooks/queries/use-throughput-scopes";
import { usePageTitle } from "@/lib/page-context";
import { prefetchScopeFieldResources } from "@/lib/prefetch-scope";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function ThroughputEntryPage() {
  usePageTitle("Throughput");
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: throughputScopes = [], isLoading } = useThroughputScopesList();

  useEffect(() => {
    if (isLoading) return;
    const queryScopeId = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (!queryScopeId) return;
    const match = throughputScopes.find((rs) => rs.scope_id === queryScopeId);
    if (match) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/throughput/$scope_id" as string, params: { scope_id: match.id }, replace: true });
    }
  }, [search.scope_id, throughputScopes, isLoading, navigate]);

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}
      <div className="text-xs text-muted-foreground mb-2">Select a scope to view its throughput:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {throughputScopes.map((s) => (
          <Link key={s.id} to="/throughput/$scope_id" params={{ scope_id: s.id }}
            onMouseEnter={() => s.field_id && prefetchScopeFieldResources(qc, s.field_id)}
            onFocus={() => s.field_id && prefetchScopeFieldResources(qc, s.field_id)}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">revision {s.revision}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
