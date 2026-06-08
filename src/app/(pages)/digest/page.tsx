"use client";

/**
 * /digest — ?scope_id= 駆動の入口。/review と同じ bridge パターン。
 */

import { useEffect } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useDigestScopesList } from "@/hooks/queries/use-digest-scopes";
import { usePageTitle } from "@/lib/page-context";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function DigestEntryPage() {
  usePageTitle("Digest");
  const { currentProject } = useProject();
  const search = useSearch({ from: "/digest" as never }) as { scope_id?: string };
  const navigate = useNavigate();
  const { data: digestScopes = [], isLoading } = useDigestScopesList(currentProject?.id);

  useEffect(() => {
    if (isLoading || !currentProject) return;
    const queryScopeId = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (!queryScopeId) return;
    const match = digestScopes.find((rs) => rs.scope_id === queryScopeId);
    if (match) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/digest/$scope_id" as string, params: { scope_id: match.id }, replace: true });
    }
  }, [search.scope_id, digestScopes, isLoading, currentProject, navigate]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}
      <div className="text-xs text-muted-foreground mb-2">Select a scope to view its digest:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {digestScopes.map((s) => (
          <Link key={s.id} to="/digest/$scope_id" params={{ scope_id: s.id }}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">revision {s.revision}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
