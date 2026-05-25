"use client";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useCreatePlan } from "@/hooks/queries/use-plans";
import { PlanFilterPicker } from "@/components/plan-filter-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlanFilterInput, MilestoneInput } from "@/lib/schemas/plan";

export default function PlanNewPage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const create = useCreatePlan(currentProject?.id);

  const [name, setName] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [timeMultiplier, setTimeMultiplier] = useState(1.0);
  const [filter, setFilter] = useState<PlanFilterInput>({});
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      project_id: currentProject!.id,
      name: name.trim(),
      daily_minutes: dailyMinutes,
      time_multiplier_pct: Math.round(timeMultiplier * 100),
      filter,
      milestones,
    });
    navigate({ to: "/plans/$planId", params: { planId: res.data.id } });
  }

  function addMilestone() {
    const today = new Date().toISOString().slice(0, 10);
    setMilestones([...milestones, { count: 100, date: today }]);
  }
  function updateMilestone(i: number, patch: Partial<MilestoneInput>) {
    setMilestones(milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function removeMilestone(i: number) {
    setMilestones(milestones.filter((_, idx) => idx !== i));
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">新しい目標を作成</h1>

      <div className="space-y-2">
        <Label>プラン名</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 簿記論 過去5年" required />
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>1 日の枠 (分)</Label>
        <Input type="number" min={1} value={dailyMinutes} onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))} />
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>時間係数 (×) <span className="text-xs text-muted-foreground font-normal">標準時間×係数を実時間として配分</span></Label>
        <Input type="number" min={0.1} step={0.1} value={timeMultiplier}
          onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))} />
      </div>

      <div className="space-y-2">
        <Label>対象問題のフィルタ (未選択カテゴリは「全て」扱い)</Label>
        <PlanFilterPicker projectId={currentProject.id} value={filter} onChange={setFilter} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>マイルストーン (累積問題数 と 締切日のペア)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addMilestone}>+ 追加</Button>
        </div>
        {milestones.length === 0 && <div className="text-xs text-muted-foreground">マイルストーン無しの自由ペース計画も可</div>}
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input type="number" min={1} value={m.count} onChange={(e) => updateMilestone(i, { count: Math.max(1, parseInt(e.target.value) || 1) })} className="w-24"/>
            <span className="text-xs">問 by</span>
            <Input type="date" value={m.date} onChange={(e) => updateMilestone(i, { date: e.target.value })} className="w-44"/>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeMilestone(i)}>削除</Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "作成中..." : "作成"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/plans" as string })}>キャンセル</Button>
      </div>
    </form>
  );
}
