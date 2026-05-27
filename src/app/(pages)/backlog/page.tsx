"use client";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useBacklogList } from "@/hooks/queries/use-backlog";
import { Button } from "@/components/ui/button";

export default function BacklogPage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { data: backlogs = [], isLoading } = useBacklogList(currentProject?.id);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backlog</h1>
        <Button onClick={() => navigate({ to: "/backlog/new" as string })}>+ New</Button>
      </div>

      {isLoading && <div>Loading...</div>}
      {!isLoading && backlogs.length === 0 && (
        <div className="text-muted-foreground text-sm">No backlogs yet. Use "+ New" to create one.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {backlogs.map((b) => (
          <Link key={b.id} to="/backlog/$backlogId" params={{ backlogId: b.id }}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{b.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {b.daily_minutes} min/day · revision {b.revision}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
