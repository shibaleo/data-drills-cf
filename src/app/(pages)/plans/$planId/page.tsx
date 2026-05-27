"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { usePlan, useUpdatePlan, useArchivePlan, type PlanMember } from "@/hooks/queries/use-plans";
import { useProject } from "@/hooks/use-project";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useQueryClient } from "@tanstack/react-query";
import { plansKeys } from "@/hooks/queries/use-plans";
import { problemsKeys } from "@/hooks/queries/use-problems";
import { PlanChart } from "@/components/plan-chart";
import { allocate, type MemberInput } from "@/lib/plan-allocate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { OpaqueTag } from "@/components/problem-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, SlidersHorizontal, ArrowLeft, Archive, Save, RotateCcw, Plus, Loader2 } from "lucide-react";
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
  const [timeMultiplier, setTimeMultiplier] = useState<number>(1.0);
  const [weekdayWeights, setWeekdayWeights] = useState<number[]>([1, 1, 1, 1, 1, 1, 1]);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);
  const [name, setName] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMilestonePins, setShowMilestonePins] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideFuture, setHideFuture] = useState(false);
  const [overflowOnly, setOverflowOnly] = useState(false);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const { data: topics = [] } = useTopicsList(currentProject?.id);

  // schedule と同じ dialog 連携 (詳細表示・編集)
  const qc = useQueryClient();
  const allProblems = useProblemsList(currentProject?.id).data ?? [];
  const tableRef = useRef<HTMLDivElement>(null);
  const handleDataChanged = useCallback(() => {
    if (currentProject) {
      qc.invalidateQueries({ queryKey: plansKeys.detail(planId) });
      qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
    }
  }, [qc, currentProject, planId]);
  const { openDetail, renderDialogs } = useProblemDialogs({
    allProblems,
    onDataChanged: handleDataChanged,
  });
  const handleSelect = useCallback((problemId: string) => {
    setSelectedId((prev) => (prev === problemId ? null : problemId));
    requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector(`[data-problem-id="${problemId}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    if (data) {
      setDailyMinutes(data.plan.daily_minutes);
      setTimeMultiplier(data.plan.time_multiplier_pct / 100);
      setWeekdayWeights(data.plan.weekday_weights);
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
    return allocate(members, milestones, dailyMinutes, today, Math.round(timeMultiplier * 100), weekdayWeights);
  }, [data, milestones, dailyMinutes, timeMultiplier, weekdayWeights, today]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">Not found</div>;

  const memberCount = data.members.length;
  const doneCount = data.members.filter((m) => m.first_answer_date).length;
  const remainingCount = memberCount - doneCount;
  const progressPct = memberCount > 0 ? Math.round((doneCount * 100) / memberCount) : 0;

  const multPct = Math.round(timeMultiplier * 100);
  const dirty =
    name !== data.plan.name ||
    dailyMinutes !== data.plan.daily_minutes ||
    multPct !== data.plan.time_multiplier_pct ||
    JSON.stringify(weekdayWeights) !== JSON.stringify(data.plan.weekday_weights) ||
    JSON.stringify(milestones) !== JSON.stringify(data.plan.milestones);

  // milestone anchors
  const orderedMembers = [...data.members].sort((a, b) =>
    a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code)
  );
  const milestoneAnchors = milestones.map((ms) => ({
    count: ms.count,
    problemId: orderedMembers[ms.count - 1]?.id ?? null,
  }));

  // problem id -> allocate 結果
  const allocByProblemId = new Map<string, { date: string; side: "past" | "future"; overflow: boolean }>();
  for (const a of allocated) {
    allocByProblemId.set(a.problemId, { date: a.date, side: a.side, overflow: a.overflow });
  }

  // ── Summary 集計 ───────────────────────────────────────────────
  function addDays(d: string, n: number) {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  function diffDays(a: string, b: string) {
    return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
  }
  const weekEnd = addDays(today, 6);
  const todayCount = allocated.filter((a) => a.side === "future" && a.date === today).length;
  const weekCount = allocated.filter((a) => a.side === "future" && a.date >= today && a.date <= weekEnd).length;
  const lastMilestone = [...milestones].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const daysToDeadline = lastMilestone ? diffDays(today, lastMilestone.date) : null;

  // ── 表示用フィルタ ─────────────────────────────────────────────
  function passesDisplayFilter(m: PlanMember): boolean {
    if (filterSubjects.size > 0 && (!m.subject_id || !filterSubjects.has(m.subject_id))) return false;
    if (filterLevels.size > 0 && (!m.level_id || !filterLevels.has(m.level_id))) return false;
    if (filterTopics.size > 0 && (!m.topic_id || !filterTopics.has(m.topic_id))) return false;
    if (hideCompleted && m.first_answer_date) return false;
    if (hideFuture && !m.first_answer_date) return false;
    if (overflowOnly && !allocByProblemId.get(m.id)?.overflow) return false;
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
      payload: { name, daily_minutes: dailyMinutes, time_multiplier_pct: multPct, weekday_weights: weekdayWeights, milestones },
    });
  }
  async function onArchive() {
    if (!confirm("この目標をアーカイブしますか? (履歴は残ります)")) return;
    await archive.mutateAsync(planId);
    navigate({ to: "/plans" as string });
  }
  function newId(): string {
    return (crypto as Crypto & { randomUUID(): string }).randomUUID();
  }
  function addRootMilestone() {
    // 空なら「開始 (count=0, today) + 最終 (count=memberCount, today+90日)」をシード。
    // 既にある場合は単一 root を末尾に追加。
    if (milestones.length === 0) {
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 90);
      const endDate = end.toISOString().slice(0, 10);
      setMilestones([
        { id: newId(), parent_id: null, count: 0, date: today },
        { id: newId(), parent_id: null, count: memberCount, date: endDate },
      ]);
      return;
    }
    setMilestones([...milestones, { id: newId(), parent_id: null, count: memberCount, date: today }]);
  }
  function addChildMilestone(parentIdx: number) {
    const parent = milestones[parentIdx];
    if (!parent) return;
    setMilestones([...milestones, { id: newId(), parent_id: parent.id, count: Math.max(1, Math.floor(parent.count / 2)), date: parent.date }]);
  }
  /** sibling = 同じ parent を持つ milestone を追加 (= 同じトラック上の新エントリ)。 */
  function addSiblingMilestone(idx: number) {
    const ref = milestones[idx];
    if (!ref) return;
    setMilestones([...milestones, { id: newId(), parent_id: ref.parent_id, count: ref.count, date: ref.date }]);
  }
  function updateMilestone(i: number, patch: Partial<MilestoneInput>) {
    setMilestones(milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function removeMilestone(i: number) {
    const target = milestones[i];
    if (!target) return;
    // 子も再帰的に削除
    const toRemove = new Set<string>([target.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of milestones) {
        if (m.parent_id && toRemove.has(m.parent_id) && !toRemove.has(m.id)) {
          toRemove.add(m.id);
          changed = true;
        }
      }
    }
    setMilestones(milestones.filter((m) => !toRemove.has(m.id)));
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── ヘッダー: 名前 + 進捗バー + revision バッジ + アクション ── */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate({ to: "/plans" as string })}
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
          title="一覧に戻る">
          <ArrowLeft className="size-5"/>
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              className="text-xl font-semibold h-9 max-w-md"/>
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded border text-muted-foreground">
              rev {data.plan.revision}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all"
                style={{ width: `${progressPct}%` }}/>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {doneCount} / {memberCount} ({progressPct}%)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button type="button"
              onClick={() => {
                setName(data.plan.name);
                setDailyMinutes(data.plan.daily_minutes);
                setTimeMultiplier(data.plan.time_multiplier_pct / 100);
                setWeekdayWeights(data.plan.weekday_weights);
                setMilestones(data.plan.milestones);
              }}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="編集内容を破棄して直前の保存状態に戻す">
              <RotateCcw className="size-3"/>
              Reset
            </button>
          )}
          <Button size="sm" onClick={onConfirm} disabled={!dirty || update.isPending}
            className={dirty ? "relative" : ""}>
            <Save className="size-3.5 mr-1"/>
            {update.isPending ? "保存中..." : "確定"}
            {dirty && !update.isPending && (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-500"/>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchive}
            className="text-muted-foreground hover:text-destructive"
            title="アーカイブ">
            <Archive className="size-3.5"/>
          </Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="今日" value={todayCount} unit="問" tone="primary"/>
        <SummaryCard label="今週" value={weekCount} unit="問" tone="default"/>
        <SummaryCard label="残" value={remainingCount} unit="問" tone="default"/>
        <SummaryCard
          label="締切まで"
          value={daysToDeadline ?? "—"}
          unit={daysToDeadline != null ? "日" : ""}
          tone={daysToDeadline != null && daysToDeadline < 30 ? "warn" : "default"}
          sub={lastMilestone?.date}
        />
      </div>

      {/* ── パラメタ ── */}
      <div className="rounded-md border divide-y">
        <div className="p-3 grid grid-cols-1 md:grid-cols-[auto,1fr] gap-x-6 gap-y-3 items-end">
          <div className="flex gap-3">
            <div className="space-y-1 w-28">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">1 日の枠 (分)</Label>
              <Input type="number" min={1} value={dailyMinutes}
                onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))}/>
            </div>
            <div className="space-y-1 w-24">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">係数 (×)</Label>
              <Input type="number" min={0.1} step={0.1} value={timeMultiplier}
                onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))}/>
            </div>
          </div>
          <WeekdayWeightsInput value={weekdayWeights} onChange={setWeekdayWeights} dailyMinutes={dailyMinutes}/>
        </div>

      </div>

      {/* ── Tetris chart ── */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs relative">
                  <Filter className="size-3 mr-1"/>
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 space-y-3" align="start">
                <FilterToggleSection>
                  <FilterToggle label="完了済みを隠す" checked={hideCompleted} onChange={setHideCompleted}/>
                  <FilterToggle label="未着手を隠す" checked={hideFuture} onChange={setHideFuture}/>
                  <FilterToggle label="溢れのみ" checked={overflowOnly} onChange={setOverflowOnly}/>
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
            <span className="text-xs text-muted-foreground tabular-nums">
              {visibleMembers.length} / {memberCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {showMilestonePins && dirty && (
              <>
                <button type="button"
                  onClick={() => {
                    setName(data.plan.name);
                    setDailyMinutes(data.plan.daily_minutes);
                    setTimeMultiplier(data.plan.time_multiplier_pct / 100);
                    setWeekdayWeights(data.plan.weekday_weights);
                    setMilestones(data.plan.milestones);
                  }}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="編集を破棄">
                  <RotateCcw className="size-3"/>Reset
                </button>
                <Button size="sm" variant="default" className="h-6 text-[10px] px-2"
                  onClick={onConfirm} disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
                  {update.isPending ? "保存中..." : "保存"}
                </Button>
              </>
            )}
            {showMilestonePins && (
              <button type="button"
                title={milestones.length === 0 ? "開始 + 最終マイルストーンを追加" : "ルートマイルストーンを追加"}
                className="inline-flex items-center justify-center size-[26px] rounded-md border text-muted-foreground hover:bg-muted transition-colors"
                onClick={addRootMilestone}>
                <Plus className="size-3"/>
              </button>
            )}
            <button type="button"
              title="マイルストーンのピンを表示/非表示"
              aria-pressed={showMilestonePins}
              className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${showMilestonePins ? "bg-accent text-accent-foreground border-accent-foreground/20" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setShowMilestonePins((p) => !p)}>
              <SlidersHorizontal className="size-3"/>
            </button>
          </div>
        </div>
        <PlanChart
          items={visibleAllocated}
          milestones={milestones}
          today={today}
          selectedId={selectedId}
          onSelect={handleSelect}
          onOpen={openDetail}
          onMilestoneDateChange={showMilestonePins ? (i, newDate) => updateMilestone(i, { date: newDate }) : undefined}
          onMilestoneCountChange={showMilestonePins ? (i, newCount) => updateMilestone(i, { count: newCount }) : undefined}
          onMilestoneNameChange={showMilestonePins ? (i, newName) => updateMilestone(i, { name: newName }) : undefined}
          onMilestoneAddChild={showMilestonePins ? addSiblingMilestone : undefined}
          onMilestoneRemove={showMilestonePins ? removeMilestone : undefined}
          showMilestonePins={showMilestonePins}
          milestoneAnchors={milestoneAnchors}
        />
        <LegendRow hideCompleted={hideCompleted} hideFuture={hideFuture}/>
      </div>

      {/* ── 問題テーブル ── */}
      <ResizableTableShell ref={tableRef}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 70 }}>Subject</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 70 }}>Level</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 64 }}>Code</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 240 }}>Name</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 64 }}>Std</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 100 }}>First</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 100 }}>Plan</TableHead>
              <TableHead className="sticky top-0 z-10 bg-background" style={{ width: 70 }}>Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMembers.map((m) => {
              const sel = selectedId === m.id;
              const alloc = allocByProblemId.get(m.id);
              const mins = m.standard_time != null ? Math.round(m.standard_time / 60) : null;
              const subj = m.subject_id ? subjectMap.get(m.subject_id) : null;
              const lv = m.level_id ? levelMap.get(m.level_id) : null;
              const anchor = milestoneAnchors.find((a) => a.problemId === m.id);
              // milestone diff: anchor.count があれば、対応 milestone date と alloc.date の差
              const anchorMs = anchor ? milestones.find((ms) => ms.count === anchor.count) : null;
              const delta = anchorMs && alloc ? diffDays(anchorMs.date, alloc.date) : null;
              return (
                <TableRow key={m.id} data-problem-id={m.id}
                  className={`cursor-pointer ${sel ? "bg-accent" : ""}`}
                  onClick={() => sel ? openDetail(m.id) : handleSelect(m.id)}
                  onDoubleClick={() => openDetail(m.id)}>
                  <TableCell style={{ width: 70 }}>{subj ? <OpaqueTag name={subj.name} color={subj.color}/> : null}</TableCell>
                  <TableCell style={{ width: 70 }}>{lv ? <OpaqueTag name={lv.name} color={lv.color}/> : null}</TableCell>
                  <TableCell style={{ width: 64 }}><span className="font-mono text-xs">{m.code}</span></TableCell>
                  <TableCell style={{ width: 240 }}><span className="truncate block text-xs">{m.name ?? ""}</span></TableCell>
                  <TableCell style={{ width: 64 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{mins != null ? `${mins}分` : ""}</span>
                  </TableCell>
                  <TableCell style={{ width: 100 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{m.first_answer_date ?? ""}</span>
                  </TableCell>
                  <TableCell style={{ width: 100 }}>
                    {alloc ? (
                      <span className={`text-xs tabular-nums font-medium ${alloc.overflow ? "text-red-500" : alloc.side === "past" ? "text-green-600" : "text-blue-500"}`}>
                        {alloc.date}{alloc.overflow ? " ⚠" : ""}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell style={{ width: 70 }}>
                    {delta != null && (
                      <span className={`text-xs tabular-nums font-medium ${delta < 0 ? "text-green-600" : delta > 0 ? "text-red-500" : "text-muted-foreground"}`}
                        title={`milestone ${anchor!.count}問 by ${anchorMs!.date} に対して${delta < 0 ? "早期" : delta > 0 ? "遅延" : "ぴったり"}`}>
                        {delta > 0 ? `+${delta}d` : delta < 0 ? `${delta}d` : "0"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ResizableTableShell>

      {renderDialogs()}
    </div>
  );
}

/* ── Summary card ──────────────────────────────────────────── */

function SummaryCard({
  label, value, unit, tone, sub,
}: {
  label: string;
  value: number | string;
  unit: string;
  tone: "default" | "primary" | "warn";
  sub?: string;
}) {
  const toneClass = tone === "primary"
    ? "border-foreground/30 bg-foreground/5"
    : tone === "warn"
    ? "border-red-500/30 bg-red-500/5"
    : "";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

/* ── Legend (pill 形に統一) ───────────────────────────────── */

function LegendRow({ hideCompleted, hideFuture }: { hideCompleted: boolean; hideFuture: boolean }) {
  const pill = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground";
  const dot = (cls: string) => <span className={`size-2 rounded-sm ${cls}`}/>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {!hideCompleted && <span className={pill}>{dot("bg-green-500")}完了</span>}
      {!hideFuture && <span className={pill}>{dot("bg-blue-500")}予定</span>}
      <span className={pill}><span className="size-2 rounded-sm border-2 border-yellow-500"/>枠超 1 問</span>
      <span className={pill}>{dot("bg-red-500")}溢れ</span>
      <span className={pill}><span className="w-0.5 h-2 bg-amber-500"/>milestone</span>
    </div>
  );
}

/* ── Filter UI helpers ────────────────────────────────────── */

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
            onCheckedChange={(checked) => toggle(item.value, checked)}/>
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
      <Checkbox className="size-3.5" checked={checked} onCheckedChange={(v) => onChange(v === true)}/>
      {label}
    </label>
  );
}

/* ── Weekday weights input ─────────────────────────────────── */

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function WeekdayWeightsInput({
  value, onChange, dailyMinutes,
}: { value: number[]; onChange: (v: number[]) => void; dailyMinutes: number }) {
  const update = (i: number, v: number) => {
    const next = [...value];
    next[i] = Math.max(0, isFinite(v) ? v : 0);
    onChange(next);
  };
  const weekSum = value.reduce((s, w) => s + w * dailyMinutes, 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">曜日別ウェイト</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums">週 {Math.round(weekSum)} 分</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DOW_LABELS.map((d, i) => {
          const isSunday = i === 0;
          const isSaturday = i === 6;
          const dayColor = isSunday ? "text-red-500" : isSaturday ? "text-blue-500" : "text-muted-foreground";
          return (
            <div key={i} className="space-y-0.5">
              <div className={`text-[10px] text-center font-medium ${dayColor}`}>{d}</div>
              <Input type="number" min={0} step={0.1} value={value[i]}
                onChange={(e) => update(i, parseFloat(e.target.value))}
                className="h-7 px-1 text-center text-xs tabular-nums"/>
              <div className="text-[9px] text-muted-foreground tabular-nums text-center">
                {Math.round(value[i] * dailyMinutes)}m
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
