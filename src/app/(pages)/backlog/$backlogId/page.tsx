"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  useBacklog, useUpdateBacklog, useArchiveBacklog,
  useCreateGoalLayer, useUpdateGoalLayer, useDeleteGoalLayer,
  useCreateGoalMilestone, useUpdateGoalMilestone, useDeleteGoalMilestone,
  type BacklogMember,
} from "@/hooks/queries/use-backlog";
import { useProject } from "@/hooks/use-project";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useQueryClient } from "@tanstack/react-query";
import { backlogKeys } from "@/hooks/queries/use-backlog";
import { problemsKeys } from "@/hooks/queries/use-problems";
import { BacklogChart, type BacklogChartHandle } from "@/components/backlog-chart";
import { allocate, type MemberInput } from "@/lib/backlog-allocate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { OpaqueTag } from "@/components/problem-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, SlidersHorizontal, ArrowLeft, Archive, Save, RotateCcw, Loader2 } from "lucide-react";
import { useTopicsList } from "@/hooks/queries/use-topics";

export default function BacklogDetailPage() {
  const { backlogId } = useParams({ strict: false }) as { backlogId: string };
  const { currentProject, subjects, levels } = useProject();
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const navigate = useNavigate();
  const { data, isLoading } = useBacklog(backlogId);
  const update = useUpdateBacklog(currentProject?.id);
  const archive = useArchiveBacklog(currentProject?.id);

  const createLayer = useCreateGoalLayer(backlogId);
  const updateLayer = useUpdateGoalLayer(backlogId);
  const deleteLayer = useDeleteGoalLayer(backlogId);
  const createMilestone = useCreateGoalMilestone(backlogId);
  const updateMilestone = useUpdateGoalMilestone(backlogId);
  const deleteMilestone = useDeleteGoalMilestone(backlogId);

  // 編集はすべてローカル state、「確定」で diff を計算して mutations を発火する。
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [timeMultiplier, setTimeMultiplier] = useState<number>(1.0);
  const [weekdayWeights, setWeekdayWeights] = useState<number[]>([1, 1, 1, 1, 1, 1, 1]);
  const [name, setName] = useState<string>("");
  type LocalLayer = { id: string; name: string; color: string | null; opacity_pct: number | null; line_style: "solid" | "dashed" | "dotted" | null; line_width: number | null };
  type LocalMilestone = { id: string; layer_id: string; target: number; date: string };
  const [localLayers, setLocalLayers] = useState<LocalLayer[]>([]);
  const [localMilestones, setLocalMilestones] = useState<LocalMilestone[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMilestonePins, setShowMilestonePins] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideFuture, setHideFuture] = useState(false);
  const [overflowOnly, setOverflowOnly] = useState(false);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const { data: topics = [] } = useTopicsList(currentProject?.id);

  const qc = useQueryClient();
  const allProblems = useProblemsList(currentProject?.id).data ?? [];
  const tableRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<BacklogChartHandle>(null);
  const handleDataChanged = useCallback(() => {
    if (currentProject) {
      qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) });
      qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
    }
  }, [qc, currentProject, backlogId]);
  const { openDetail, renderDialogs } = useProblemDialogs({ allProblems, onDataChanged: handleDataChanged });
  const handleSelect = useCallback((problemId: string) => {
    setSelectedId((prev) => (prev === problemId ? null : problemId));
    requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector(`[data-problem-id="${problemId}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const lastSyncRevRef = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    // 初回ロード or 保存後 (revision が増えた) のみローカル state を server data から再同期する。
    if (lastSyncRevRef.current === data.backlog.revision) return;
    lastSyncRevRef.current = data.backlog.revision;
    setDailyMinutes(data.backlog.daily_minutes);
    setTimeMultiplier(data.backlog.time_multiplier_pct / 100);
    setWeekdayWeights(data.backlog.weekday_weights);
    setName(data.backlog.name);
    setLocalLayers(data.layers.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, opacity_pct: l.opacity_pct ?? null, line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null, line_width: l.line_width ?? null })));
    setLocalMilestones(data.milestones.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date })));
  }, [data]);

  const today = new Date().toISOString().slice(0, 10);

  const allocated = useMemo(() => {
    if (!data) return [];
    const members: MemberInput[] = data.members.map((m) => ({
      id: m.id, code: m.code, name: m.name,
      standardTimeSec: m.standard_time, firstAnswerDate: m.first_answer_date,
    }));
    return allocate(members, localMilestones, dailyMinutes, today, Math.round(timeMultiplier * 100), weekdayWeights);
  }, [data, localMilestones, dailyMinutes, timeMultiplier, weekdayWeights, today]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">Not found</div>;

  const memberCount = data.members.length;
  const doneCount = data.members.filter((m) => m.first_answer_date).length;
  const progressPct = memberCount > 0 ? Math.round((doneCount * 100) / memberCount) : 0;

  const multPct = Math.round(timeMultiplier * 100);
  const planDirty =
    name !== data.backlog.name ||
    dailyMinutes !== data.backlog.daily_minutes ||
    multPct !== data.backlog.time_multiplier_pct ||
    JSON.stringify(weekdayWeights) !== JSON.stringify(data.backlog.weekday_weights);
  const layersDirty = JSON.stringify(localLayers) !== JSON.stringify(data.layers.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, opacity_pct: l.opacity_pct ?? null, line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null, line_width: l.line_width ?? null })));
  const milestonesDirty = JSON.stringify(localMilestones) !== JSON.stringify(data.milestones.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date })));
  const dirty = planDirty || layersDirty || milestonesDirty;

  // 全 milestone を target 昇順に sort、各 milestone の「target 番目の problem」を anchor とする
  const orderedMembers = [...data.members].sort((a, b) =>
    a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code)
  );
  const milestoneAnchors = localMilestones.map((ms) => ({
    target: ms.target,
    layer_id: ms.layer_id,
    problemId: orderedMembers[ms.target - 1]?.id ?? null,
  }));

  const allocByProblemId = new Map<string, { date: string; side: "past" | "future"; overflow: boolean }>();
  for (const a of allocated) {
    allocByProblemId.set(a.problemId, { date: a.date, side: a.side, overflow: a.overflow });
  }

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
  const lastMs = [...localMilestones].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const daysToDeadline = lastMs ? diffDays(today, lastMs.date) : null;

  function passesDisplayFilter(m: BacklogMember): boolean {
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

  function tmpId(): string {
    return `tmp-${(crypto as Crypto & { randomUUID(): string }).randomUUID()}`;
  }
  const isTmp = (id: string) => id.startsWith("tmp-");

  async function onConfirm() {
    if (!data) return;
    // plan-level
    if (planDirty) {
      await update.mutateAsync({
        id: backlogId,
        payload: { name, daily_minutes: dailyMinutes, time_multiplier_pct: multPct, weekday_weights: weekdayWeights },
      });
    }

    // layer 削除 (server に存在、local に無い)
    const localLayerIds = new Set(localLayers.map((l) => l.id));
    for (const sv of data.layers) {
      if (!localLayerIds.has(sv.id)) {
        await deleteLayer.mutateAsync(sv.id);
      }
    }
    // layer 新規 (tmp- prefix)、id を解決して map に
    const layerIdMap = new Map<string, string>();  // tmp → real
    for (let i = 0; i < localLayers.length; i++) {
      const l = localLayers[i];
      if (isTmp(l.id)) {
        const res = await createLayer.mutateAsync({
          backlog_id: backlogId, name: l.name,
          color: l.color ?? undefined,
          opacity_pct: l.opacity_pct ?? undefined,
          line_style: l.line_style ?? undefined,
          line_width: l.line_width ?? undefined,
          sort_order: i,
        });
        layerIdMap.set(l.id, res.data.id);
      }
    }
    // layer 既存編集 (name or sort_order 変化)
    for (let i = 0; i < localLayers.length; i++) {
      const l = localLayers[i];
      if (isTmp(l.id)) continue;
      const orig = data.layers.find((o) => o.id === l.id);
      if (!orig) continue;
      const origOrder = data.layers.findIndex((o) => o.id === l.id);
      const payload: { name?: string; color?: string | null; opacity_pct?: number | null; line_style?: "solid" | "dashed" | "dotted" | null; line_width?: number | null; sort_order?: number } = {};
      if (orig.name !== l.name) payload.name = l.name;
      if ((orig.color ?? null) !== (l.color ?? null)) payload.color = l.color;
      if ((orig.opacity_pct ?? null) !== (l.opacity_pct ?? null)) payload.opacity_pct = l.opacity_pct;
      if ((orig.line_style ?? null) !== (l.line_style ?? null)) payload.line_style = l.line_style;
      if ((orig.line_width ?? null) !== (l.line_width ?? null)) payload.line_width = l.line_width;
      if (origOrder !== i) payload.sort_order = i;
      if (Object.keys(payload).length > 0) {
        await updateLayer.mutateAsync({ id: l.id, payload });
      }
    }

    // milestone 削除
    const localMsIds = new Set(localMilestones.map((m) => m.id));
    for (const sv of data.milestones) {
      if (!localMsIds.has(sv.id)) {
        await deleteMilestone.mutateAsync(sv.id);
      }
    }
    // milestone 新規
    for (const m of localMilestones) {
      if (isTmp(m.id)) {
        const layerId = isTmp(m.layer_id) ? layerIdMap.get(m.layer_id)! : m.layer_id;
        await createMilestone.mutateAsync({ backlog_id: backlogId, layer_id: layerId, target: m.target, date: m.date });
      }
    }
    // milestone 既存編集
    for (const m of localMilestones) {
      if (isTmp(m.id)) continue;
      const orig = data.milestones.find((o) => o.id === m.id);
      if (!orig) continue;
      const payload: { layer_id?: string; target?: number; date?: string } = {};
      if (orig.layer_id !== m.layer_id) payload.layer_id = m.layer_id;
      if (orig.target !== m.target) payload.target = m.target;
      if (orig.date !== m.date) payload.date = m.date;
      if (Object.keys(payload).length > 0) {
        await updateMilestone.mutateAsync({ id: m.id, payload });
      }
    }
  }
  async function onArchive() {
    if (!confirm("Archive this backlog? (History will be preserved)")) return;
    await archive.mutateAsync(backlogId);
    navigate({ to: "/backlog" as string });
  }

  function centerDate(): string {
    return chartRef.current?.getCenterDate() ?? today;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start gap-4">
        <button onClick={() => navigate({ to: "/backlog" as string })}
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors" title="Back to list">
          <ArrowLeft className="size-5"/>
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              className="text-xl font-semibold h-9 max-w-md"/>
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded border text-muted-foreground">rev {data.backlog.revision}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }}/>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {doneCount} / {memberCount} ({progressPct} %)
            </div>
            {daysToDeadline != null && (
              <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded border whitespace-nowrap ${daysToDeadline < 30 ? "border-red-500/50 text-red-500" : "text-muted-foreground"}`}
                title={`Deadline: ${lastMs?.date}`}>
                D{daysToDeadline >= 0 ? `-${daysToDeadline}` : `+${Math.abs(daysToDeadline)}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onArchive}
            className="text-muted-foreground hover:text-destructive" title="Archive">
            <Archive className="size-3.5"/>
          </Button>
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs relative">
                  <Filter className="size-3 mr-1"/>Filter
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 space-y-3" align="start">
                <FilterToggleSection>
                  <FilterToggle label="Hide completed" checked={hideCompleted} onChange={setHideCompleted}/>
                  <FilterToggle label="Hide pending" checked={hideFuture} onChange={setHideFuture}/>
                  <FilterToggle label="Overflow only" checked={overflowOnly} onChange={setOverflowOnly}/>
                </FilterToggleSection>
                {subjects.length > 0 && (
                  <FilterSection label="Subject" items={subjects.map((s) => ({ value: s.id, label: s.name }))}
                    selected={filterSubjects} onChange={setFilterSubjects}/>
                )}
                {levels.length > 0 && (
                  <FilterSection label="Level" items={levels.map((l) => ({ value: l.id, label: l.name }))}
                    selected={filterLevels} onChange={setFilterLevels}/>
                )}
                {topics.length > 0 && (
                  <FilterSection label="Topic" items={topics.map((t) => ({ value: t.id, label: t.name }))}
                    selected={filterTopics} onChange={setFilterTopics}/>
                )}
                {activeFilterCount > 0 && (
                  <button type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                    onClick={() => {
                      setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterTopics(new Set());
                      setHideCompleted(false); setHideFuture(false); setOverflowOnly(false);
                    }}>Clear all</button>
                )}
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground tabular-nums">{visibleMembers.length} / {memberCount}</span>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <>
                <button type="button"
                  onClick={() => {
                    setName(data.backlog.name); setDailyMinutes(data.backlog.daily_minutes);
                    setTimeMultiplier(data.backlog.time_multiplier_pct / 100);
                    setWeekdayWeights(data.backlog.weekday_weights);
                    setLocalLayers(data.layers.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, opacity_pct: l.opacity_pct ?? null, line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null, line_width: l.line_width ?? null })));
                    setLocalMilestones(data.milestones.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date })));
                  }}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="Discard changes"><RotateCcw className="size-3"/>Reset</button>
                <Button size="sm" onClick={onConfirm} disabled={update.isPending}
                  className="h-7 text-xs">
                  {update.isPending ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
                  {update.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
            <button type="button"
              title="マイルストーンのピンを表示/非表示" aria-pressed={showMilestonePins}
              className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${showMilestonePins ? "bg-accent text-accent-foreground border-accent-foreground/20" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setShowMilestonePins((p) => !p)}>
              <SlidersHorizontal className="size-3"/>
            </button>
          </div>
        </div>
        <BacklogChart
          ref={chartRef}
          rightPanelExtra={
            <div className="space-y-3 text-xs" style={{ width: 200 }}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Max (min)</Label>
                  <Input type="number" min={1} value={dailyMinutes}
                    onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-7 text-xs tabular-nums text-center"/>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Mult ×</Label>
                  <Input type="number" min={0.1} step={0.1} value={timeMultiplier}
                    onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))}
                    className="h-7 text-xs tabular-nums text-center"/>
                </div>
              </div>
              <div className="flex items-baseline justify-between border-t pt-1">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Weekly</span>
                <span className="text-[11px] tabular-nums">{Math.round(weekdayWeights.reduce((s, w) => s + w * dailyMinutes, 0))} m</span>
              </div>
              <div>
                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground block mb-1">Rate</Label>
                <div className="space-y-0.5">
                  {(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const).map((d, idxInUi) => {
                    // 表示は月始まり、index は実際の曜日 (Sun=0..Sat=6)
                    const i = (idxInUi + 1) % 7;
                    const dayColor = i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground";
                    const mins = Math.round(weekdayWeights[i] * dailyMinutes);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`text-[10px] font-medium w-7 text-center ${dayColor}`}>{d}</div>
                        <Input type="number" min={0} step={0.1} value={weekdayWeights[i]}
                          onChange={(e) => {
                            const v = Math.max(0, parseFloat(e.target.value) || 0);
                            setWeekdayWeights((prev) => prev.map((w, idx) => idx === i ? v : w));
                          }}
                          className="h-6 flex-1 px-1 text-center text-[10px] tabular-nums"/>
                        <span className="text-[9px] tabular-nums text-muted-foreground w-10 text-right">{mins} m</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          }
          items={visibleAllocated}
          layers={localLayers.map((l) => {
            const ms = localMilestones.filter((m) => m.layer_id === l.id);
            const maxTarget = ms.reduce((acc, m) => Math.max(acc, m.target), 0);
            return { ...l, progress: maxTarget > 0 ? { done: Math.min(doneCount, maxTarget), total: maxTarget } : null };
          })}
          milestones={localMilestones}
          today={today}
          selectedId={selectedId}
          onSelect={handleSelect}
          onOpen={openDetail}
          showMilestonePins={showMilestonePins}
          milestoneAnchors={milestoneAnchors}
          /* すべてローカル state を更新するだけ。API は「確定」で発火。 */
          onMilestoneDateDraft={(id, newDate) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, date: newDate } : m)))}
          onMilestoneDateChange={(id, newDate) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, date: newDate } : m)))}
          onMilestoneTargetChange={(id, newTarget) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, target: newTarget } : m)))}
          onMilestoneRemove={(id) =>
            setLocalMilestones((prev) => prev.filter((m) => m.id !== id))}
          onMilestoneAddToLayer={(layerId, atDate) =>
            setLocalMilestones((prev) => [...prev, { id: tmpId(), layer_id: layerId, target: memberCount, date: atDate ?? centerDate() }])}
          onLayerNameChange={(id, newName) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)))}
          onLayerColorChange={(id, newColor) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, color: newColor } : l)))}
          onLayerStyleChange={(id, patch) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))}
          onLayerRemove={(id) => {
            setLocalLayers((prev) => prev.filter((l) => l.id !== id));
            setLocalMilestones((prev) => prev.filter((m) => m.layer_id !== id));
          }}
          onAddLayer={() =>
            setLocalLayers((prev) => [...prev, { id: tmpId(), name: "", color: null, opacity_pct: null, line_style: null, line_width: null }])}
          onReorderLayers={(ids) => {
            setLocalLayers((prev) => {
              const map = new Map(prev.map((l) => [l.id, l]));
              return ids.map((id) => map.get(id)).filter((x): x is LocalLayer => !!x);
            });
          }}
        />
        <LegendRow hideCompleted={hideCompleted} hideFuture={hideFuture}/>
      </div>

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
              const anchorMs = anchor ? localMilestones.find((ms) => ms.target === anchor.target) : null;
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
                      <span className={`text-xs tabular-nums font-medium ${alloc.overflow ? "text-red-500" : alloc.side === "past" ? "text-indigo-500" : "text-blue-500"}`}>
                        {alloc.date}{alloc.overflow ? " ⚠" : ""}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell style={{ width: 70 }}>
                    {delta != null && (
                      <span className={`text-xs tabular-nums font-medium ${delta < 0 ? "text-green-600" : delta > 0 ? "text-red-500" : "text-muted-foreground"}`}
                        title={`Milestone #${anchor!.target} by ${anchorMs!.date}: ${delta < 0 ? "early" : delta > 0 ? "late" : "on time"}`}>
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

function LegendRow({ hideCompleted, hideFuture }: { hideCompleted: boolean; hideFuture: boolean }) {
  const pill = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground";
  const dot = (cls: string) => <span className={`size-2 rounded-sm ${cls}`}/>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {!hideCompleted && <span className={pill}>{dot("bg-indigo-500")}Done</span>}
      {!hideFuture && <span className={pill}>{dot("bg-blue-500")}Planned</span>}
      <span className={pill}>{dot("bg-yellow-500")}Over budget</span>
      <span className={pill}>{dot("bg-red-500")}Overflow</span>
    </div>
  );
}

function SummaryCard({ label, value, unit, tone, sub }: {
  label: string; value: number | string; unit: string;
  tone: "default" | "primary" | "warn"; sub?: string;
}) {
  const toneClass = tone === "primary" ? "border-foreground/30 bg-foreground/5"
    : tone === "warn" ? "border-red-500/30 bg-red-500/5" : "";
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

function FilterSection({ label, items, selected, onChange }: {
  label: string; items: { value: string; label: string }[];
  selected: Set<string>; onChange: (next: Set<string>) => void;
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

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function WeekdayWeightsInput({ value, onChange, dailyMinutes }: {
  value: number[]; onChange: (v: number[]) => void; dailyMinutes: number;
}) {
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
          const dayColor = i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground";
          return (
            <div key={i} className="space-y-0.5">
              <div className={`text-[10px] text-center font-medium ${dayColor}`}>{d}</div>
              <Input type="number" min={0} step={0.1} value={value[i]}
                onChange={(e) => update(i, parseFloat(e.target.value))}
                className="h-7 px-1 text-center text-xs tabular-nums"/>
              <div className="text-[9px] text-muted-foreground tabular-nums text-center">{Math.round(value[i] * dailyMinutes)}m</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
