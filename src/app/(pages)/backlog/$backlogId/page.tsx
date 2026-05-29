"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  useBacklog, useArchiveBacklog,
  useBacklogBatchSave,
  useBacklogRevisions,
  type BacklogMember,
} from "@/hooks/queries/use-backlog";
import type { BacklogBatchInput, BacklogUpdateInput } from "@/lib/schemas/backlog";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";
import { applyMemberFilter } from "@/lib/member-filter";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { useProject } from "@/hooks/use-project";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useQueryClient } from "@tanstack/react-query";
import { backlogKeys } from "@/hooks/queries/use-backlog";
import { problemsKeys } from "@/hooks/queries/use-problems";
import { BacklogChart, type BacklogChartHandle } from "@/components/backlog-chart";
import { allocate, type MemberInput } from "@/lib/backlog-allocate";
import { formatRelDay } from "@/lib/relative-day";
import { todayJST } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { SimpleSortHeader, applySort, type SortState } from "@/components/simple-sort-header";
import { OpaqueTag } from "@/components/problem-card";
import { BlockLegend } from "@/components/block-legend";
import { FilterSection } from "@/components/filter-section";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, SlidersHorizontal, ArrowLeft, Archive, Save, RotateCcw, Loader2, Download, History, ListFilter, MoreVertical, Check, X } from "lucide-react";
import { AsOfControls } from "@/components/as-of-controls";
import { useTopicsList } from "@/hooks/queries/use-topics";
import { usePageTitle } from "@/lib/page-context";
import { rpc } from "@/lib/rpc-client";
import { toast } from "sonner";

export default function BacklogDetailPage() {
  const { backlogId } = useParams({ strict: false }) as { backlogId: string };
  const { currentProject, subjects, levels } = useProject();
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState<string | null>(null);  // null = 現在モード
  const readOnly = asOf != null;
  // 注: asOf はチャート側の client-side フィルタ専用にし、エンティティ取得は常に最新を引く。
  // (asOf がエンティティ作成より古い場合に server 側の bitemporal WHERE で 404 になる問題回避)
  const { data, isLoading } = useBacklog(backlogId);
  const revisionsQuery = useBacklogRevisions(backlogId);
  const archive = useArchiveBacklog(currentProject?.id);
  const batchSave = useBacklogBatchSave(backlogId, currentProject?.id);

  // 編集はすべてローカル state、「確定」で diff を計算して mutations を発火する。
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [timeMultiplier, setTimeMultiplier] = useState<number>(1.0);
  const [weekdayWeights, setWeekdayWeights] = useState<number[]>([1, 1, 1, 1, 1, 1, 1]);
  const [name, setName] = useState<string>("");
  type LocalLayer = { id: string; name: string; color: string | null; opacity_pct: number | null; line_style: "solid" | "dashed" | "dotted" | null; line_width: number | null };
  type LocalMilestone = { id: string; layer_id: string; target: number; date: string };
  const [localLayers, setLocalLayers] = useState<LocalLayer[]>([]);
  const [localMilestones, setLocalMilestones] = useState<LocalMilestone[]>([]);
  const [localFilter, setLocalFilter] = useState<MemberFilterInput>({});
  const [membersEditorOpen, setMembersEditorOpen] = useState(false);
  const [sortState, setSortState] = useState<SortState>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMilestonePins, setShowMilestonePins] = useState(false);
  const [hideFirst, setHideFirst] = useState(false);
  const [hideFuture, setHideFuture] = useState(false);
  const [overflowOnly, setOverflowOnly] = useState(false);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(new Set());
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"waking" | "generating" | "downloading" | null>(null);
  const { data: topics = [] } = useTopicsList(currentProject?.id);

  // Filter prefs persistence
  const filterPrefsQuery = useFilterPrefs(currentProject?.id);
  const saveFilterPrefs = useSaveFilterPrefs(currentProject?.id);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current === currentProject.id) return;
    if (filterPrefsQuery.data === undefined) return;
    const p = filterPrefsQuery.data?.backlog;
    if (p) {
      setFilterSubjects(new Set(p.subjectIds ?? []));
      setFilterLevels(new Set(p.levelIds ?? []));
      setFilterTopics(new Set(p.topicIds ?? []));
      setHideFirst(!!p.hideFirst);
      setHideFuture(!!p.hideFuture);
      setOverflowOnly(!!p.overflowOnly);
      setHiddenLayerIds(new Set(p.hiddenLayerIds ?? []));
    }
    prefsLoadedRef.current = currentProject.id;
  }, [currentProject, filterPrefsQuery.data]);
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current !== currentProject.id) return;
    saveFilterPrefs.mutate({
      ...(filterPrefsQuery.data ?? {}),
      backlog: {
        subjectIds: [...filterSubjects],
        levelIds: [...filterLevels],
        topicIds: [...filterTopics],
        hideFirst, hideFuture, overflowOnly,
        hiddenLayerIds: [...hiddenLayerIds],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSubjects, filterLevels, filterTopics, hideFirst, hideFuture, overflowOnly, hiddenLayerIds]);

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
    setLocalFilter(data.backlog.filter ?? {});
  }, [data]);

  // today は asOf に追従 (再生中・ドラッグ中も today 線がそこに移動する)。
  const today = asOf ?? todayJST();

  /**
   * filter が編集中なら useProblemsList + applyMemberFilter で再計算、
   * 未編集ならサーバ計算済 data.members を流用 (= 余計な再計算なし)。
   * セマンティクスはサーバ側 fetchMembers と同一 (両者とも applyMemberFilter 経由)。
   */
  const effectiveMembers = useMemo<BacklogMember[]>(() => {
    if (!data) return [];
    const sameFilter = JSON.stringify(data.backlog.filter ?? {}) === JSON.stringify(localFilter);
    // asOf 指定中はその日以前の answer のみで first_answer_date を再計算する必要があるので、
    // サーバ値 data.members は使わず allProblems から都度クライアント計算する。
    if (sameFilter && !asOf) return data.members;
    if (allProblems.length === 0) return data.members;
    const filtered = applyMemberFilter(
      allProblems.map((p) => ({
        subjectId: p.subject_id || null,
        levelId: p.level_id || null,
        _orig: p,
      })),
      localFilter,
    );
    return filtered
      .map(({ _orig: p }) => {
        // asOf 適用: その日以前の answer 中の最古を first_answer_date とする
        // (answers は date ASC でサーバから返ってきている)。
        const firstAns = asOf
          ? p.answers.find((a) => a.date <= asOf)?.date ?? null
          : p.answers[0]?.date ?? null;
        return {
          id: p.id,
          code: p.code,
          name: p.name || null,
          standard_time: p.standard_time,
          subject_id: p.subject_id || null,
          level_id: p.level_id || null,
          topic_id: p.topic_id,
          first_answer_date: firstAns,
        };
      })
      .sort((a, b) => a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code));
  }, [data, localFilter, allProblems, asOf]);

  const allocated = useMemo(() => {
    if (!data) return [];
    const members: MemberInput[] = effectiveMembers.map((m) => ({
      id: m.id, code: m.code, name: m.name,
      standardTimeSec: m.standard_time, firstAnswerDate: m.first_answer_date,
    }));
    return allocate(members, localMilestones, dailyMinutes, today, Math.round(timeMultiplier * 100), weekdayWeights);
  }, [data, effectiveMembers, localMilestones, dailyMinutes, timeMultiplier, weekdayWeights, today]);

  usePageTitle("Backlog");

  const handleExport = useCallback(async () => {
    if (exportSelected.size === 0) return;
    setExporting(true);
    setExportPhase("waking");
    try {
      const healthRes = await rpc.api.v1["pdf-export"].health.$get();
      if (!healthRes.ok) {
        const body = (await healthRes.json().catch(() => ({ error: healthRes.statusText }))) as { error?: string };
        throw new Error(body.error || "PDF service unhealthy");
      }
      setExportPhase("generating");
      const res = await rpc.api.v1["pdf-export"].$post({
        json: { problem_ids: Array.from(exportSelected) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(body.error || "Export failed");
      }
      setExportPhase("downloading");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backlog-${today}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDFエクスポート完了");
    } catch (err) {
      toast.error(`エクスポート失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
      setExportPhase(null);
    }
  }, [exportSelected, today]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">Not found</div>;

  const memberCount = effectiveMembers.length;
  const doneCount = effectiveMembers.filter((m) => m.first_answer_date).length;
  const progressPct = memberCount > 0 ? Math.round((doneCount * 100) / memberCount) : 0;

  const multPct = Math.round(timeMultiplier * 100);
  // local 状態がまだサーバ値と同期していない (初回読み込み直後) は dirty=false で抑える
  // → ナビゲーション時に Save ボタンが一瞬光るのを防ぐ。
  const synced = lastSyncRevRef.current === data.backlog.revision;
  const planDirty = synced && (
    name !== data.backlog.name ||
    dailyMinutes !== data.backlog.daily_minutes ||
    multPct !== data.backlog.time_multiplier_pct ||
    JSON.stringify(weekdayWeights) !== JSON.stringify(data.backlog.weekday_weights)
  );
  const layersDirty = synced && JSON.stringify(localLayers) !== JSON.stringify(data.layers.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, opacity_pct: l.opacity_pct ?? null, line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null, line_width: l.line_width ?? null })));
  const milestonesDirty = synced && JSON.stringify(localMilestones) !== JSON.stringify(data.milestones.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date })));
  const filterDirty = synced && JSON.stringify(localFilter) !== JSON.stringify(data.backlog.filter ?? {});
  // dirty な間は editor を閉じられないようにする (preview を隠したくない)
  const membersOpen = membersEditorOpen || filterDirty;
  // readOnly (= 過去 snapshot 表示中) なら history panel を自動展開
  // (= 戻るためのトリガーを常時露出させる)
  const historyOpen = historyPanelOpen || readOnly;
  // filter dirty 中は chart 上の milestone pin 編集 UI も自動的に展開
  // (= ユーザーが overflow / anchor を直接調整できるようにする)
  const milestonePinsVisible = showMilestonePins || filterDirty;
  const dirty = planDirty || layersDirty || milestonesDirty || filterDirty;

  // 全 milestone を target 昇順に sort、各 milestone の「target 番目の problem」を anchor とする
  const orderedMembers = [...effectiveMembers].sort((a, b) =>
    a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code)
  );
  const milestoneAnchors = localMilestones.map((ms) => ({
    target: ms.target,
    layer_id: ms.layer_id,
    problemId: orderedMembers[ms.target - 1]?.id ?? null,
  }));

  // filter 変更時の milestone 影響: 旧/新 anchor を比較して overflow / changed を判定
  const oldOrderedMembers = [...data.members].sort((a, b) =>
    a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code),
  );
  const milestoneImpacts = localMilestones.map((ms) => {
    const oldAnchor = oldOrderedMembers[ms.target - 1] ?? null;
    const newAnchor = orderedMembers[ms.target - 1] ?? null;
    const overflow = ms.target > orderedMembers.length;
    const changed = !overflow && filterDirty && oldAnchor?.id !== newAnchor?.id;
    return { ms, oldAnchor, newAnchor, overflow, changed };
  });

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
    if (hideFirst && m.first_answer_date) return false;
    if (hideFuture && !m.first_answer_date) return false;
    if (overflowOnly && !allocByProblemId.get(m.id)?.overflow) return false;
    return true;
  }
  const visibleMembers = applySort(
    effectiveMembers.filter(passesDisplayFilter),
    sortState,
    {
      subject: (m) => m.subject_id ? subjectMap.get(m.subject_id)?.name ?? "" : "",
      level: (m) => m.level_id ? levelMap.get(m.level_id)?.name ?? "" : "",
      code: (m) => m.code,
      name: (m) => m.name ?? "",
      std: (m) => m.standard_time ?? 0,
      first: (m) => m.first_answer_date ?? "",
      plan: (m) => allocByProblemId.get(m.id)?.date ?? "",
    },
  );
  const visibleIds = new Set(visibleMembers.map((m) => m.id));
  const visibleAllocated = allocated.filter((a) => visibleIds.has(a.problemId));

  const activeFilterCount =
    filterSubjects.size + filterLevels.size + filterTopics.size
    + (hideFirst ? 1 : 0) + (hideFuture ? 1 : 0) + (overflowOnly ? 1 : 0);

  function tmpId(): string {
    return `tmp-${(crypto as Crypto & { randomUUID(): string }).randomUUID()}`;
  }
  const isTmp = (id: string) => id.startsWith("tmp-");

  async function onConfirm() {
    if (!data) return;

    // ローカルの diff を 1 つの batch payload に組み立てる
    const payload: BacklogBatchInput = {
      layer_deletes: [], layer_creates: [], layer_updates: [],
      milestone_deletes: [], milestone_creates: [], milestone_updates: [],
    };
    if (planDirty || filterDirty) {
      const upd: BacklogUpdateInput = {};
      if (planDirty) {
        upd.name = name;
        upd.daily_minutes = dailyMinutes;
        upd.time_multiplier_pct = multPct;
        upd.weekday_weights = weekdayWeights;
      }
      if (filterDirty) {
        upd.filter = localFilter;
      }
      payload.backlog_update = upd;
    }
    // layer
    const localLayerIds = new Set(localLayers.map((l) => l.id));
    for (const sv of data.layers) {
      if (!localLayerIds.has(sv.id)) payload.layer_deletes!.push(sv.id);
    }
    for (let i = 0; i < localLayers.length; i++) {
      const l = localLayers[i];
      if (isTmp(l.id)) {
        payload.layer_creates!.push({
          temp_id: l.id, backlog_id: backlogId, name: l.name,
          color: l.color ?? undefined,
          opacity_pct: l.opacity_pct ?? undefined,
          line_style: l.line_style ?? undefined,
          line_width: l.line_width ?? undefined,
          sort_order: i,
        });
      } else {
        const orig = data.layers.find((o) => o.id === l.id);
        if (!orig) continue;
        const origOrder = data.layers.findIndex((o) => o.id === l.id);
        const diff: { name?: string; color?: string | null; opacity_pct?: number | null; line_style?: "solid" | "dashed" | "dotted" | null; line_width?: number | null; sort_order?: number } = {};
        if (orig.name !== l.name) diff.name = l.name;
        if ((orig.color ?? null) !== (l.color ?? null)) diff.color = l.color;
        if ((orig.opacity_pct ?? null) !== (l.opacity_pct ?? null)) diff.opacity_pct = l.opacity_pct;
        if ((orig.line_style ?? null) !== (l.line_style ?? null)) diff.line_style = l.line_style;
        if ((orig.line_width ?? null) !== (l.line_width ?? null)) diff.line_width = l.line_width;
        if (origOrder !== i) diff.sort_order = i;
        if (Object.keys(diff).length > 0) payload.layer_updates!.push({ id: l.id, payload: diff });
      }
    }
    // milestone
    const localMsIds = new Set(localMilestones.map((m) => m.id));
    for (const sv of data.milestones) {
      if (!localMsIds.has(sv.id)) payload.milestone_deletes!.push(sv.id);
    }
    for (const m of localMilestones) {
      if (isTmp(m.id)) {
        payload.milestone_creates!.push({
          temp_id: m.id, backlog_id: backlogId,
          layer_id: m.layer_id,  // tmp なら server が id_map で解決
          target: m.target, date: m.date,
        });
      } else {
        const orig = data.milestones.find((o) => o.id === m.id);
        if (!orig) continue;
        const diff: { layer_id?: string; target?: number; date?: string } = {};
        if (orig.layer_id !== m.layer_id) diff.layer_id = m.layer_id;
        if (orig.target !== m.target) diff.target = m.target;
        if (orig.date !== m.date) diff.date = m.date;
        if (Object.keys(diff).length > 0) payload.milestone_updates!.push({ id: m.id, payload: diff });
      }
    }
    await batchSave.mutateAsync(payload);
    // backlog.revision が変わらなくても (layer/milestone のみの編集) ローカルを
    // 次の data fetch で再同期させるため、sync ガードを外しておく。
    lastSyncRevRef.current = null;
    toast.success("Saved");
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
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate({ to: "/backlog" as string })}
          className="text-muted-foreground hover:text-foreground transition-colors" title="Back to list">
          <ArrowLeft className="size-4"/>
        </button>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly}
          className="h-7 text-xs max-w-xs"/>
        <div className="flex-1 max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }}/>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {doneCount} / {memberCount} ({progressPct} %)
        </div>
        {dirty && !readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button"
              onClick={() => {
                setName(data.backlog.name); setDailyMinutes(data.backlog.daily_minutes);
                setTimeMultiplier(data.backlog.time_multiplier_pct / 100);
                setWeekdayWeights(data.backlog.weekday_weights);
                setLocalLayers(data.layers.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, opacity_pct: l.opacity_pct ?? null, line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null, line_width: l.line_width ?? null })));
                setLocalMilestones(data.milestones.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date })));
                setLocalFilter(data.backlog.filter ?? {});
              }}
              disabled={batchSave.isPending}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Discard changes"><RotateCcw className="size-3"/>Reset</button>
            <Button size="sm" onClick={onConfirm} disabled={batchSave.isPending}
              className="h-7 text-xs">
              {batchSave.isPending ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
              {batchSave.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        <Popover open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <PopoverTrigger asChild>
            <button type="button" title="More"
              aria-pressed={moreMenuOpen || membersOpen || historyOpen}
              className={`${dirty && !readOnly ? "" : "ml-auto"} inline-flex items-center justify-center size-7 rounded-md border transition-colors ${
                filterDirty
                  ? "border-primary/50 text-primary"
                  : (membersOpen || historyOpen || moreMenuOpen)
                    ? "bg-accent text-accent-foreground border-accent-foreground/40"
                    : "text-muted-foreground hover:bg-muted"
              }`}>
              <MoreVertical className="size-3.5"/>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            <MenuItem
              icon={<ListFilter className="size-3.5"/>}
              label="Members filter"
              active={membersOpen}
              disabled={readOnly}
              onClick={() => { setMembersEditorOpen((v) => !v); setMoreMenuOpen(false); }}
            />
            <MenuItem
              icon={<History className="size-3.5"/>}
              label="View history"
              active={historyOpen}
              onClick={() => { setHistoryPanelOpen((v) => !v); setMoreMenuOpen(false); }}
            />
            <div className="h-px bg-border my-1"/>
            <MenuItem
              icon={<Archive className="size-3.5"/>}
              label="Archive…"
              destructive
              disabled={readOnly}
              onClick={() => { setMoreMenuOpen(false); onArchive(); }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {historyOpen && (
        <div className="rounded-md border px-3 py-2 text-xs space-y-2">
          <AsOfControls
            asOf={asOf}
            setAsOf={setAsOf}
            latest={todayJST()}
            onClose={readOnly ? undefined : () => setHistoryPanelOpen(false)}
          />
          <div className="max-h-56 overflow-y-auto pr-1 space-y-0.5 border-t pt-1.5">
            {(revisionsQuery.data ?? []).length === 0 && (
              <div className="text-[10px] text-muted-foreground italic py-2 text-center">No revisions yet</div>
            )}
            {(revisionsQuery.data ?? []).map((r) => {
              const ts = new Date(r.valid_from);
              const tsLabel = `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;
              const isoDay = ts.toISOString().slice(0, 10);
              const isActiveAsOf = asOf === isoDay;
              const kindCls = r.kind === "backlog" ? "text-foreground/80" : r.kind === "layer" ? "text-violet-500" : "text-pink-500";
              return (
                <button key={`${r.kind}-${r.entity_id}-${r.revision}`}
                  type="button"
                  onClick={() => setAsOf(isoDay)}
                  className={`w-full text-left flex items-baseline gap-2 px-2 py-1 rounded-sm transition-colors hover:bg-accent ${isActiveAsOf ? "bg-accent" : ""}`}>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-16 shrink-0">{tsLabel}</span>
                  <span className={`text-[9px] uppercase font-semibold w-12 shrink-0 ${kindCls}`}>{r.kind}</span>
                  <span className="text-[10px] flex-1 truncate">{r.summary}</span>
                  <span className="text-[9px] text-muted-foreground">rev {r.revision}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {membersOpen && !readOnly && currentProject && (
        <div className={`relative rounded-md border ${filterDirty ? "border-primary/40 bg-primary/5" : ""} px-3 py-2 text-xs space-y-2`}>
          <button type="button" onClick={() => setMembersEditorOpen(false)} disabled={filterDirty}
            title="Close"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">
            <X className="size-3.5"/>
          </button>
          <MemberFilterPicker
            projectId={currentProject.id}
            value={localFilter}
            onChange={setLocalFilter}
            trailing={
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {filterDirty && (
                  <button type="button"
                    className="hover:text-foreground"
                    onClick={() => setLocalFilter(data.backlog.filter ?? {})}>
                    Reset
                  </button>
                )}
                <span className="tabular-nums">
                  {data.members.length}{filterDirty ? ` → ${effectiveMembers.length}` : ""} problems
                </span>
              </div>
            }
          />
          {filterDirty && (
            milestoneImpacts.some((i) => i.overflow || i.changed) ? (
              <ul className="space-y-1 pt-1.5 border-t">
                {milestoneImpacts.filter((i) => i.overflow || i.changed).map(({ ms, oldAnchor, newAnchor, overflow }) => (
                  <li key={ms.id} className="flex items-center gap-2">
                    <OpaqueTag
                      name={overflow ? "Overflow" : "Anchor"}
                      color={overflow ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                    />
                    <span className="tabular-nums">target={ms.target}</span>
                    <span className="text-muted-foreground">
                      {overflow
                        ? `Exceeds new member count ${effectiveMembers.length} — adjust target before Save`
                        : `${oldAnchor?.code ?? "—"} → ${newAnchor?.code ?? "—"}`}
                    </span>
                  </li>
                ))}
              </ul>
            )
            : (
              <div className="text-[10px] text-muted-foreground pt-1.5 border-t">No milestone impact</div>
            )
          )}
        </div>
      )}

      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-6 px-2 relative" title="Filter">
                  <Filter className="size-3"/>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 space-y-3" align="start">
                <FilterToggleSection>
                  <FilterToggle label="Hide First" checked={hideFirst} onChange={setHideFirst}/>
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
                      setHideFirst(false); setHideFuture(false); setOverflowOnly(false);
                    }}>Clear all</button>
                )}
              </PopoverContent>
            </Popover>
            <BlockLegend entries={[
              ...(hideFirst ? [] : [{ kind: "fill" as const, label: "First", color: "#ec4899" }]),
              ...(hideFuture ? [] : [{ kind: "fill" as const, label: "Planned", color: "#8b5cf6" }]),
              { kind: "ring" as const, label: "Over budget", color: "#f59e0b" },
              { kind: "ring" as const, label: "Overflow", color: "#ef4444" },
            ]}/>
            {exportSelected.size > 0 && (
              <Button
                size="sm" variant="outline" className="h-6 text-[10px] px-2"
                onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Download className="size-3 mr-1"/>}
                {exporting
                  ? exportPhase === "waking" ? "Render 起床中..."
                    : exportPhase === "generating" ? "PDF 処理中..."
                      : exportPhase === "downloading" ? "ダウンロード中..."
                        : "エクスポート中..."
                  : `PDF (${exportSelected.size})`}
              </Button>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">{visibleMembers.length} / {memberCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button"
              title="Toggle milestone pins" aria-pressed={milestonePinsVisible}
              className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${milestonePinsVisible ? "bg-accent text-accent-foreground border-accent-foreground/20" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setShowMilestonePins((p) => !p)}>
              <SlidersHorizontal className="size-3"/>
            </button>
          </div>
        </div>
        <BacklogChart
          ref={chartRef}
          onTodayDrag={(d) => setAsOf(d === todayJST() ? null : d)}
          rightPanelExtra={
            <div className="space-y-3 text-xs" style={{ width: 200 }}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Max (min)</Label>
                  <Input type="number" min={1} value={dailyMinutes} disabled={readOnly}
                    onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-7 text-xs tabular-nums text-center"/>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Mult ×</Label>
                  <Input type="number" min={0.1} step={0.1} value={timeMultiplier} disabled={readOnly}
                    onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))}
                    className="h-7 text-xs tabular-nums text-center"/>
                </div>
              </div>
              <div className="flex items-baseline justify-between border-t pt-1">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Weekly</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(weekdayWeights.reduce((s, w) => s + w * dailyMinutes, 0))} m</span>
              </div>
              {lastMs && daysToDeadline != null && (
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Deadline</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {lastMs.date}
                    <span className={`ml-1.5 ${daysToDeadline < 30 ? "text-destructive/80" : ""}`}>
                      ({daysToDeadline >= 0 ? `D-${daysToDeadline}` : `D+${Math.abs(daysToDeadline)}`})
                    </span>
                  </span>
                </div>
              )}
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
                        <Input type="number" min={0} step={0.1} value={weekdayWeights[i]} disabled={readOnly}
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
          showMilestonePins={milestonePinsVisible}
          milestoneAnchors={milestoneAnchors}
          hiddenLayerIds={hiddenLayerIds}
          onHiddenLayersChange={setHiddenLayerIds}
          /* すべてローカル state を更新するだけ。API は「確定」で発火。
             readOnly (= snapshot 表示中) は編集系コールバックを渡さない → chart 側で
             cursor-grab・+ ボタン等の affordance も無効化される。 */
          onMilestoneDateDraft={readOnly ? undefined : (id, newDate) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, date: newDate } : m)))}
          onMilestoneDateChange={readOnly ? undefined : (id, newDate) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, date: newDate } : m)))}
          onMilestoneLayerDraft={readOnly ? undefined : (id, newLayerId) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, layer_id: newLayerId } : m)))}
          onMilestoneLayerChange={readOnly ? undefined : (id, newLayerId) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, layer_id: newLayerId } : m)))}
          onMilestoneTargetChange={readOnly ? undefined : (id, newTarget) =>
            setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, target: newTarget } : m)))}
          onMilestoneRemove={readOnly ? undefined : (id) =>
            setLocalMilestones((prev) => prev.filter((m) => m.id !== id))}
          onMilestoneAddToLayer={readOnly ? undefined : (layerId, atDate) =>
            setLocalMilestones((prev) => [...prev, { id: tmpId(), layer_id: layerId, target: memberCount, date: atDate ?? centerDate() }])}
          onLayerNameChange={readOnly ? undefined : (id, newName) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)))}
          onLayerColorChange={readOnly ? undefined : (id, newColor) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, color: newColor } : l)))}
          onLayerStyleChange={readOnly ? undefined : (id, patch) =>
            setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))}
          onLayerRemove={readOnly ? undefined : (id) => {
            setLocalLayers((prev) => prev.filter((l) => l.id !== id));
            setLocalMilestones((prev) => prev.filter((m) => m.layer_id !== id));
          }}
          onAddLayer={readOnly ? undefined : () =>
            setLocalLayers((prev) => [...prev, { id: tmpId(), name: "", color: null, opacity_pct: null, line_style: null, line_width: null }])}
          onReorderLayers={readOnly ? undefined : (ids) => {
            setLocalLayers((prev) => {
              const map = new Map(prev.map((l) => [l.id, l]));
              return ids.map((id) => map.get(id)).filter((x): x is LocalLayer => !!x);
            });
          }}
        />
      </div>

      {visibleMembers.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center rounded-md border">No data</div>
      ) : (
      <ResizableTableShell ref={tableRef}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur w-10 px-3">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary cursor-pointer"
                    checked={exportSelected.size > 0 && exportSelected.size === visibleMembers.length}
                    ref={(el) => { if (el) el.indeterminate = exportSelected.size > 0 && exportSelected.size < visibleMembers.length; }}
                    onChange={() => {
                      if (exportSelected.size > 0) setExportSelected(new Set());
                      else setExportSelected(new Set(visibleMembers.map((m) => m.id)));
                    }}
                  />
                </div>
              </TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}><SimpleSortHeader label="Subject" sortKey="subject" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}><SimpleSortHeader label="Level" sortKey="level" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 64 }}><SimpleSortHeader label="Code" sortKey="code" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 240 }}><SimpleSortHeader label="Name" sortKey="name" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 64 }}><SimpleSortHeader label="Std" sortKey="std" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 100 }}><SimpleSortHeader label="First" sortKey="first" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 100 }}><SimpleSortHeader label="Plan" sortKey="plan" state={sortState} setState={setSortState}/></TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}>Δ</TableHead>
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
                  <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary cursor-pointer"
                        checked={exportSelected.has(m.id)}
                        onChange={() => {
                          setExportSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                            return next;
                          });
                        }}
                      />
                    </div>
                  </TableCell>
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
                      <span className={`text-xs tabular-nums font-medium ${alloc.overflow ? "text-red-500" : alloc.side === "past" ? "text-pink-500" : "text-violet-500"}`}>
                        {alloc.date}{alloc.overflow ? " ⚠" : ""}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell style={{ width: 70 }}>
                    {delta != null && (
                      <span className={`text-xs tabular-nums font-medium ${delta < 0 ? "text-green-600" : delta > 0 ? "text-red-500" : "text-muted-foreground"}`}
                        title={`Milestone #${anchor!.target} by ${anchorMs!.date}: ${delta < 0 ? "early" : delta > 0 ? "late" : "on time"}`}>
                        {formatRelDay(delta)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ResizableTableShell>
      )}

      {renderDialogs()}
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

function MenuItem({ icon, label, active, destructive, disabled, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent"
      } ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      <span className={active ? "text-primary" : ""}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="size-3 text-primary"/>}
    </button>
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
