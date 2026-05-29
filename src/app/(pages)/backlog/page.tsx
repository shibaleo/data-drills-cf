"use client";
import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useBacklogList } from "@/hooks/queries/use-backlog";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { applyMemberFilter } from "@/lib/member-filter";
import { usePageTitle } from "@/lib/page-context";
import { Plus } from "lucide-react";

export default function BacklogPage() {
  usePageTitle("Backlog");
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { data: backlogs = [], isLoading } = useBacklogList(currentProject?.id);
  const { data: allProblems = [] } = useProblemsList(currentProject?.id);

  // 各 backlog の filter で members を絞り、進捗 (done / total) を出す
  const progressByBacklog = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const b of backlogs) {
      const members = applyMemberFilter(
        allProblems.map((p) => ({ subjectId: p.subject_id || null, levelId: p.level_id || null, _p: p })),
        b.filter,
      ).map((x) => x._p);
      const done = members.filter((p) => p.answers.length > 0).length;
      m.set(b.id, { done, total: members.length });
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
            <Link key={b.id} to="/backlog/$backlogId" params={{ backlogId: b.id }}
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
          onClick={() => navigate({ to: "/backlog/new" as string })}
          className="flex items-center justify-center gap-2 rounded border border-dashed border-muted-foreground/40 p-4 text-muted-foreground hover:text-foreground hover:border-foreground/60 hover:bg-accent/30 transition min-h-[5.5rem]">
          <Plus className="size-4"/>
          <span className="text-sm font-medium">New</span>
        </button>
      </div>
    </div>
  );
}
