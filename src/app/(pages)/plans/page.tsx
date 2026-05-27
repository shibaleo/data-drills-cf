"use client";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { usePlansList } from "@/hooks/queries/use-plans";
import { Button } from "@/components/ui/button";

export default function PlansPage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = usePlansList(currentProject?.id);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">目標管理</h1>
        <Button onClick={() => navigate({ to: "/plans/new" as string })}>+ 新規</Button>
      </div>

      {isLoading && <div>Loading...</div>}
      {!isLoading && plans.length === 0 && (
        <div className="text-muted-foreground text-sm">まだ目標が無い。「+ 新規」から作成。</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Link key={p.id} to="/plans/$planId" params={{ planId: p.id }}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{p.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {p.daily_minutes} 分/日 · revision {p.revision}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
