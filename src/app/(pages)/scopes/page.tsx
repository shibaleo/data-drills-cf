"use client";
import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useScopes } from "@/hooks/queries/use-scopes";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { usePageTitle } from "@/lib/page-context";
import { prefetchScopeFromFilter } from "@/lib/prefetch-scope";
import { Plus } from "lucide-react";

export default function ScopesPage() {
  usePageTitle("Scopes");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: scopes = [], isLoading } = useScopes();
  const { data: allProblems = [] } = useProblemsList();

  // 各 scope の filter で members を絞り、進捗 (done / total) を出す。
  // 中間 map 作成を避け、1パス per scope で直接判定 (allocation 不要)
  const progressByScope = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const s of scopes) {
      const filter = (s.filter ?? {}) as { fieldIds?: string[]; subjectIds?: string[]; levelIds?: string[] };
      // useProblemsList は field_id を返す (Phase 6 で rename 済)
      const fieldSet = filter.fieldIds?.length ? new Set(filter.fieldIds) : null;
      const subjectSet = filter.subjectIds?.length ? new Set(filter.subjectIds) : null;
      const levelSet = filter.levelIds?.length ? new Set(filter.levelIds) : null;
      let total = 0;
      let done = 0;
      for (const p of allProblems) {
        if (fieldSet && (!p.field_id || !fieldSet.has(p.field_id))) continue;
        if (subjectSet && (!p.subject_id || !subjectSet.has(p.subject_id))) continue;
        if (levelSet && (!p.level_id || !levelSet.has(p.level_id))) continue;
        total++;
        if (p.answers.length > 0) done++;
      }
      m.set(s.id, { done, total });
    }
    return m;
  }, [scopes, allProblems]);

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scopes.map((s) => {
          const prog = progressByScope.get(s.id) ?? { done: 0, total: 0 };
          const pct = prog.total > 0 ? Math.round((prog.done * 100) / prog.total) : 0;
          return (
            <Link key={s.id} to="/scopes/$scope_id" params={{ scope_id: s.id }}
              onMouseEnter={() => prefetchScopeFromFilter(qc, s.filter as { fieldIds?: string[] })}
              onFocus={() => prefetchScopeFromFilter(qc, s.filter as { fieldIds?: string[] })}
              className="block border rounded p-4 hover:bg-accent transition space-y-2">
              <div className="font-semibold">{s.name}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }}/>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {prog.done} / {prog.total} ({pct}%)
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {s.daily_minutes} min/day · revision {s.revision}
              </div>
            </Link>
          );
        })}
        <button type="button"
          onClick={() => navigate({ to: "/scopes/new" as string })}
          className="flex items-center justify-center gap-2 rounded border border-dashed border-muted-foreground/40 p-4 text-muted-foreground hover:text-foreground hover:border-foreground/60 hover:bg-accent/30 transition min-h-[5.5rem]">
          <Plus className="size-4"/>
          <span className="text-sm font-medium">New</span>
        </button>
      </div>
    </div>
  );
}
