"use client";
import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { usePlan, useUpdatePlan, useArchivePlan, type PlanMember } from "@/hooks/queries/use-plans";
import { useProject } from "@/hooks/use-project";
import { PlanChart } from "@/components/plan-chart";
import { allocate, type MemberInput } from "@/lib/plan-allocate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OpaqueTag } from "@/components/problem-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, SlidersHorizontal } from "lucide-react";
import { useTopicsList } from "@/hooks/queries/use-topics";
import type { MilestoneInput } from "@/lib/schemas/plan";

export default function PlanDetailPage() {
  const { planId } = useParams({ strict: false }) as { planId: string };
  const { currentProject, subjects, levels } = useProject();
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const navigate = useNavigate();
  const { data, isLoading } = usePlan(planId);
  const update = useUpdatePlan(currentProject?.id);
  const archive = useArchivePlan(currentProject?.id);

  // ローカル編集状態 (確定で PUT)
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [timeMultiplier, setTimeMultiplier] = useState<number>(1.0);  // UI 表示は倍率、保存時に *100
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);
  const [name, setName] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMilestonePins, setShowMilestonePins] = useState(true);
  // 表示用フィルタ (DB の plan.filter とは独立、見る範囲を絞るだけ)
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideFuture, setHideFuture] = useState(false);
  const [overflowOnly, setOverflowOnly] = useState(false);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const { data: topics = [] } = useTopicsList(currentProject?.id);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  useEffect(() => {
    if (data) {
      setDailyMinutes(data.plan.daily_minutes);
      setTimeMultiplier(data.plan.time_multiplier_pct / 100);
      setMilestones(data.plan.milestones);
      setName(data.plan.name);
    }
  }, [data]);

  const today = new Date().toISOString().slice(0, 10);

  const allocated = useMemo(() => {
    if (!data) return [];
    const members: MemberInput[] = data.members.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      standardTimeSec: m.standard_time,
      firstAnswerDate: m.first_answer_date,
    }));
    return allocate(members, milestones, dailyMinutes, today, Math.round(timeMultiplier * 100));
  }, [data, milestones, dailyMinutes, timeMultiplier, today]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">Not found</div>;

  const memberCount = data.members.length;
  const doneCount = data.members.filter((m) => m.first_answer_date).length;
  const multPct = Math.round(timeMultiplier * 100);
  const dirty =
    name !== data.plan.name ||
    dailyMinutes !== data.plan.daily_minutes ||
    multPct !== data.plan.time_multiplier_pct ||
    JSON.stringify(milestones) !== JSON.stringify(data.plan.milestones);

  // 各 problem の予定日 (allocate 結果) を index 化
  const dateByProblemId = new Map<string, { date: string; side: "past" | "future"; overflow: boolean }>();
  for (const a of allocated) {
    dateByProblemId.set(a.problemId, { date: a.date, side: a.side, overflow: a.overflow });
  }

  // 表示用フィルタ — Subject/Level/Topic + 状態系トグル
  function passesDisplayFilter(m: PlanMember): boolean {
    if (filterSubjects.size > 0 && (!m.subject_id || !filterSubjects.has(m.subject_id))) return false;
    if (filterLevels.size > 0 && (!m.level_id || !filterLevels.has(m.level_id))) return false;
    if (filterTopics.size > 0 && (!m.topic_id || !filterTopics.has(m.topic_id))) return false;
    if (hideCompleted && m.first_answer_date) return false;
    if (hideFuture && !m.first_answer_date) return false;
    if (overflowOnly && !dateByProblemId.get(m.id)?.overflow) return false;
    return true;
  }
  const visibleMembers = data.members.filter(passesDisplayFilter);
  const visibleIds = new Set(visibleMembers.map((m) => m.id));
  const visibleAllocated = allocated.filter((a) => visibleIds.has(a.problemId));

  const activeFilterCount =
    filterSubjects.size + filterLevels.size + filterTopics.size
    + (hideCompleted ? 1 : 0) + (hideFuture ? 1 : 0) + (overflowOnly ? 1 : 0);

  async function onConfirm() {
    await update.mutateAsync({
      id: planId,
      payload: { name, daily_minutes: dailyMinutes, time_multiplier_pct: multPct, milestones },
    });
  }
  async function onArchive() {
    if (!confirm("この目標をアーカイブしますか? (履歴は残ります)")) return;
    await archive.mutateAsync(planId);
    navigate({ to: "/plans" as string });
  }
  function addMilestone() {
    setMilestones([...milestones, { count: memberCount, date: today }]);
  }
  function updateMilestone(i: number, patch: Partial<MilestoneInput>) {
    setMilestones(milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function removeMilestone(i: number) {
    setMilestones(milestones.filter((_, idx) => idx !== i));
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-baseline gap-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="text-xl font-semibold max-w-md"/>
        <div className="text-sm text-muted-foreground">
          {doneCount} / {memberCount} 完了 · revision {data.plan.revision}
        </div>
      </div>

      {/* パラメタ (chart の上) */}
      <div className="rounded-md border p-3 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 max-w-xs">
          <div className="space-y-1">
            <Label>1 日の枠 (分)</Label>
            <Input type="number" min={1} value={dailyMinutes} onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))}/>
          </div>
          <div className="space-y-1">
            <Label>時間係数 (×) <span className="text-xs text-muted-foreground font-normal">標準時間に掛ける</span></Label>
            <Input type="number" min={0.1} step={0.1} value={timeMultiplier}
              onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))}/>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>マイルストーン</Label>
            <Button type="button" variant="outline" size="sm" onClick={addMilestone}>+ 追加</Button>
          </div>
          {milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="number" min={1} value={m.count}
                onChange={(e) => updateMilestone(i, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-24"/>
              <span className="text-xs">問 by</span>
              <Input type="date" value={m.date} onChange={(e) => updateMilestone(i, { date: e.target.value })} className="w-44"/>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeMilestone(i)}>削除</Button>
            </div>
          ))}
        </div>
      </div>

      {/* Tetris chart */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            表示: {visibleMembers.length} / {memberCount}
          </div>
          <div className="flex items-center gap-2">
          <button type="button"
            title="マイルストーンのピンを表示/非表示"
            aria-pressed={showMilestonePins}
            className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${showMilestonePins ? "bg-accent text-accent-foreground border-accent-foreground/20" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => setShowMilestonePins((p) => !p)}>
            <SlidersHorizontal className="size-3" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs relative">
                <Filter className="size-3 mr-1" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 space-y-3" align="end">
              <FilterToggleSection>
                <FilterToggle label="完了済みを隠す" checked={hideCompleted} onChange={setHideCompleted} />
                <FilterToggle label="未着手を隠す" checked={hideFuture} onChange={setHideFuture} />
                <FilterToggle label="溢れのみ" checked={overflowOnly} onChange={setOverflowOnly} />
              </FilterToggleSection>
              {subjects.length > 0 && (
                <FilterSection label="Subject"
                  items={subjects.map((s) => ({ value: s.id, label: s.name }))}
                  selected={filterSubjects} onChange={setFilterSubjects}/>
              )}
              {levels.length > 0 && (
                <FilterSection label="Level"
                  items={levels.map((l) => ({ value: l.id, label: l.name }))}
                  selected={filterLevels} onChange={setFilterLevels}/>
              )}
              {topics.length > 0 && (
                <FilterSection label="Topic"
                  items={topics.map((t) => ({ value: t.id, label: t.name }))}
                  selected={filterTopics} onChange={setFilterTopics}/>
              )}
              {activeFilterCount > 0 && (
                <button type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                  onClick={() => {
                    setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterTopics(new Set());
                    setHideCompleted(false); setHideFuture(false); setOverflowOnly(false);
                  }}>
                  すべて解除
                </button>
              )}
            </PopoverContent>
          </Popover>
          </div>
        </div>
        <PlanChart
          items={visibleAllocated}
          milestones={milestones}
          today={today}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          onMilestoneDateChange={showMilestonePins ? (i, newDate) => updateMilestone(i, { date: newDate }) : undefined}
          showMilestonePins={showMilestonePins}
        />
        <div className="text-xs text-muted-foreground flex gap-4">
          {!hideCompleted && <span><span className="inline-block w-3 h-3 bg-green-500 mr-1 align-middle"/>完了</span>}
          {!hideFuture && <span><span className="inline-block w-3 h-3 bg-blue-500 mr-1 align-middle"/>予定</span>}
          <span><span className="inline-block w-3 h-3 border-2 border-yellow-500 mr-1 align-middle"/>枠超 1 問</span>
          <span><span className="inline-block w-3 h-3 bg-red-500 mr-1 align-middle"/>溢れ</span>
          <span><span className="inline-block w-1 h-3 bg-amber-500 mr-1 align-middle"/>milestone</span>
        </div>
      </div>

      {/* 問題テーブル (schedule と同じスタイル) */}
      <div
        className="rounded-md border overflow-auto resize-y"
        style={{ height: "calc(10 * 2.25rem)", minHeight: "6rem", maxHeight: "80vh" }}
      >
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 70 }}>Subject</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 70 }}>Level</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 64 }}>Code</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 240 }}>Name</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 64 }}>Std</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 100 }}>First</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 120 }}>Plan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.filter((m) => !hideCompleted || !m.first_answer_date).map((m) => {
              const sel = selectedId === m.id;
              const alloc = dateByProblemId.get(m.id);
              const mins = m.standard_time != null ? Math.round(m.standard_time / 60) : null;
              const subj = m.subject_id ? subjectMap.get(m.subject_id) : null;
              const lv = m.level_id ? levelMap.get(m.level_id) : null;
              return (
                <TableRow
                  key={m.id}
                  data-problem-id={m.id}
                  className={`cursor-pointer ${sel ? "bg-accent" : ""}`}
                  onClick={() => setSelectedId(sel ? null : m.id)}
                >
                  <TableCell style={{ width: 70 }}>
                    {subj ? <OpaqueTag name={subj.name} color={subj.color} /> : null}
                  </TableCell>
                  <TableCell style={{ width: 70 }}>
                    {lv ? <OpaqueTag name={lv.name} color={lv.color} /> : null}
                  </TableCell>
                  <TableCell style={{ width: 64 }}><span className="font-mono text-xs">{m.code}</span></TableCell>
                  <TableCell style={{ width: 240 }}><span className="truncate block text-xs">{m.name ?? ""}</span></TableCell>
                  <TableCell style={{ width: 64 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{mins != null ? `${mins}分` : ""}</span>
                  </TableCell>
                  <TableCell style={{ width: 100 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{m.first_answer_date ?? ""}</span>
                  </TableCell>
                  <TableCell style={{ width: 120 }}>
                    {alloc ? (
                      <span className={`text-xs tabular-nums font-medium ${alloc.overflow ? "text-red-500" : alloc.side === "past" ? "text-green-600" : "text-blue-500"}`}>
                        {alloc.date}{alloc.overflow ? " ⚠" : ""}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2">
        <Button onClick={onConfirm} disabled={!dirty || update.isPending}>
          {update.isPending ? "保存中..." : dirty ? "確定 (新 revision)" : "変更なし"}
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/plans" as string })}>戻る</Button>
        <Button variant="ghost" onClick={onArchive} className="ml-auto text-destructive">アーカイブ</Button>
      </div>
    </div>
  );
}

/* ── Filter UI helpers (schedule の FilterSection と同形) ───────── */

function FilterSection({
  label, items, selected, onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (value: string, checked: boolean | "indeterminate") => {
    const next = new Set(selected);
    if (checked === true) next.add(value); else next.delete(value);
    onChange(next);
  };
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground mb-1">{label}</div>
      {items.map((item) => (
        <label key={item.value} className="flex items-center gap-2 px-1 py-1 text-xs rounded-sm hover:bg-accent cursor-pointer">
          <Checkbox className="size-3.5" checked={selected.has(item.value)}
            onCheckedChange={(checked) => toggle(item.value, checked)} />
          {item.label}
        </label>
      ))}
    </div>
  );
}

function FilterToggleSection({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 pb-2 border-b">{children}</div>;
}

function FilterToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-1 py-1 text-xs rounded-sm hover:bg-accent cursor-pointer">
      <Checkbox className="size-3.5" checked={checked}
        onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}
