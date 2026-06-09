"use client";

import { useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useScopes } from "@/hooks/queries/use-scopes";
import { useField } from "@/hooks/use-field";

// /scopes (hub) では非表示。/scopes/$scopeId (detail) や /review 等の view では表示
const VIEW_RE = /^\/(review|throughput|stats|digest|plan)(\/|$)|^\/scopes\/[^?]/;

/**
 * グローバル top-bar の canonical scope 切替コンボ。
 *
 * - 表示は scope 系ルート (/review, /throughput, /stats, /digest, /scopes) でのみ
 * - 値は currentScopeId (= context, localStorage 連動)
 * - 変更時は同じ view の entry ページ (`/[view]?scope_id=<canonical>`) に navigate。
 *   各 entry ページが per-view の detail URL に redirect する既存ロジックを再利用
 */
export function GlobalScopePicker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = pathname.match(VIEW_RE);
  const view = match?.[1] ?? null;
  const { data: scopes = [] } = useScopes();
  const { currentScopeId, setCurrentScopeId } = useField();
  const navigate = useNavigate();

  const sorted = useMemo(
    () => [...scopes].sort((a, b) => a.name.localeCompare(b.name)),
    [scopes],
  );

  if (!view || sorted.length === 0) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    setCurrentScopeId(id);
    if (id) {
      navigate({ to: `/${view}` as string, search: { scope_id: id } });
    }
  }

  return (
    <select
      value={currentScopeId ?? ""}
      onChange={onChange}
      className="h-7 text-xs rounded border bg-background px-2 max-w-[16rem] truncate"
      title="Switch scope"
    >
      <option value="">— select scope —</option>
      {sorted.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
