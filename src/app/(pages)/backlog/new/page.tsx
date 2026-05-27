"use client";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useCreateBacklog } from "@/hooks/queries/use-backlog";
import { BacklogFilterPicker } from "@/components/backlog-filter-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BacklogFilterInput } from "@/lib/schemas/backlog";

export default function BacklogNewPage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const create = useCreateBacklog(currentProject?.id);

  const [name, setName] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [timeMultiplier, setTimeMultiplier] = useState(1.0);
  const [filter, setFilter] = useState<BacklogFilterInput>({});

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      project_id: currentProject!.id,
      name: name.trim(),
      daily_minutes: dailyMinutes,
      time_multiplier_pct: Math.round(timeMultiplier * 100),
      weekday_weights: [1, 1, 1, 1, 1, 1, 1],
      filter,
    });
    navigate({ to: "/backlog/$backlogId" as string, params: { backlogId: res.data.id } });
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Create new backlog</h1>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bookkeeping past 5 years" required />
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>Daily budget (min)</Label>
        <Input type="number" min={1} value={dailyMinutes} onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))} />
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>Time multiplier (×) <span className="text-xs text-muted-foreground font-normal">standard_time × this = effective time</span></Label>
        <Input type="number" min={0.1} step={0.1} value={timeMultiplier}
          onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))} />
      </div>

      <div className="space-y-2">
        <Label>Member filter (empty category = all)</Label>
        <BacklogFilterPicker projectId={currentProject.id} value={filter} onChange={setFilter} />
      </div>

      <div className="text-xs text-muted-foreground italic">
        Layers and milestones can be added on the detail page after creation.
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/backlog" as string })}>Cancel</Button>
      </div>
    </form>
  );
}
