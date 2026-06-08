"use client";
import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useBacklogList } from "@/hooks/queries/use-backlog";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { usePageTitle } from "@/lib/page-context";
import { Plus } from "lucide-react";

export default function ScopesPage() {
  usePageTitle("Scopes");
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { data: backlogs = [], isLoading } = useBacklogList(currentProject?.id);
  const { data: allProblems = [] } = useProblemsList(currentProject?.id);

  // 各 backlog の filter で members を絞り、進捗 (done / total) を出す。
  // 中間 map 作成を避け、1パス per backlog で直接判定 (allocation 不要)
  const progressByBacklog = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const b of backlogs) {
      const subjectSet = b.filter.subjectIds?.length ? new Set(b.filter.subjectIds) : null;
      const levelSet = b.filter.levelIds?.length ? new Set(b.filter.levelIds) : null;
      let total = 0;
      let done = 0;
      for (const p of allProblems) {
        if (subjectSet && (!p.subject_id || !subjectSet.has(p.subject_id))) continue;
        if (levelSet && (!p.level_id || !levelSet.has(p.level_id))) continue;
        total++;
        if (p.answers.length > 0) done++;
      }
      m.set(b.id, { done, total });
    }
    return m;
  }, [backlogs, allProblems]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {backlogs.map((b) => {
          const prog = progressByBacklog.get(b.id) ?? { done: 0, total: 0 };
          const pct = prog.total > 0 ? Math.round((prog.done * 100) / prog.total) : 0;
          return (
            <Link key={b.id} to="/scopes/$scopeId" params={{ scopeId: b.id }}
              className="block border rounded p-4 hover:bg-accent transition space-y-2">
              <div className="font-semibold">{b.name}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }}/>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {prog.done} / {prog.total} ({pct}%)
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {b.daily_minutes} min/day · revision {b.revision}
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
