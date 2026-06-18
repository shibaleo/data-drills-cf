"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  SlidersHorizontal,
  Save,
  RotateCcw,
  Loader2,
  History,
  Download,
  Filter,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { useField } from "@/hooks/use-field";
import { useSrs } from "@/hooks/queries/use-srs";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useScopes, useScope, useScopeDetail, useScopeTimeline, useUpdateScope, sliceTimelineAtAsOf } from "@/hooks/queries/use-scopes";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle, usePageBack } from "@/lib/page-context";
import { todayJST } from "@/lib/date-utils";
import { TetrisChart, KindToggles, type TetrisChartHandle, type OverlayBlock } from "@/components/tetris";
import { assembleOverlay } from "@/lib/answer-history-overlay";
import { ScopePlanRightPanel } from "@/components/scope-plan-right-panel";
import { ScopeFSRSOverridePanel } from "@/components/scope-fsrs-override-panel";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";
import { COLOR_PLANNED } from "@/lib/block-color";
import { useAnswerHistoryList } from "@/hooks/queries/use-answer-history";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { AsOfControls } from "@/components/as-of-controls";
import { FilterSection } from "@/components/filter-section";
import { planScheduleColumns, toScheduleRow } from "@/components/plan-schedule-columns";
import { useScopeEditState } from "@/hooks/use-scope-edit-state";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { PdfExportButton } from "@/components/pdf-export-button";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";

/** Solid の繰り返しはこの期間まで */
const PROJECTION_HORIZON_DAYS = 365 * 2;

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function PlanPage() {
  usePageTitle("Plan");
  const navigate = useNavigate();
  usePageBack(useCallback(() => navigate({ to: "/scopes" as string }), [navigate]));
  const { statuses, currentScopeId, setCurrentScopeId } = useField();
  const realToday = todayJST();
  const [asOf, setAsOf] = useState<string | null>(null);
  const readOnly = asOf != null;
  const today = asOf ?? realToday;

  // scope は GlobalScopePicker または ?scope_id= から取得。
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const { data: scopes = [] } = useScopes();
  useEffect(() => {
    if (search.scope_id && search.scope_id !== currentScopeId) {
      setCurrentScopeId(search.scope_id);
    }
  }, [search.scope_id, currentScopeId, setCurrentScopeId]);
  const scopeId = currentScopeId;
  const selectedScope = useMemo(
    () => scopes.find((s) => s.id === scopeId) ?? null,
    [scopes, scopeId],
  );
  const fieldId = (selectedScope?.filter as { fieldIds?: string[] } | undefined)?.fieldIds?.[0] ?? null;

  const { data: detail = null } = useScopeDetail(scopeId ?? "");
  const { data: timeline = null } = useScopeTimeline(scopeId ?? "");
  const scopeQuery = useScope(scopeId ?? "");
  const updateScope = useUpdateScope();
  const allProblems = useProblemsList(fieldId ?? undefined).data ?? [];
  const reviewQuery = useSrs(fieldId ?? undefined, null, scopeId ?? undefined);
  // Past throughput (= 過去 answer 履歴)。1 answer = 1 ブロックを overlay として今日より前に積む。
  // asOf 再生時は asOf 以前のみ表示するため、client 側 filter で対応。
  const throughputQuery = useAnswerHistoryList(undefined, null, scopeId ?? undefined);

  // AsOf 時点の scope/layers/milestones を timeline から再構築。members/subjects/levels
  // は live (detail) 由来 (problem は bitemporal でないので意味のある再構築不可)。
  // 過去 asOf では filter も past scope のものを使い、past member set を再現する。
  const detailAtAsOf = useMemo(() => {
    if (!detail) return null;
    if (!timeline) return detail;
    const sliced = sliceTimelineAtAsOf(timeline, asOf);
    if (!sliced.scope) return detail;
    return {
      ...detail,
      scope: sliced.scope,
      layers: sliced.layers.map((l) => ({
        id: l.id, revision: l.revision, name: l.name,
        color: l.color, opacity_pct: l.opacity_pct,
        line_style: l.line_style, line_width: l.line_width,
        sort_order: l.sort_order,
      })),
      milestones: sliced.milestones.map((m) => ({
        id: m.id, revision: m.revision, layer_id: m.layer_id,
        target: m.target, date: m.date,
      })),
    } as typeof detail;
  }, [detail, timeline, asOf]);

  const edit = useScopeEditState({
    scopeId: scopeId ?? "",
    data: detailAtAsOf,
    today,
    realToday,
    asOf,
    allProblems,
    // asOf 切替で必ず再 sync。同 asOf 内 + 同 scope.revision なら編集を守る。
    syncKey: detailAtAsOf
      ? `${asOf ?? "live"}-${detailAtAsOf.scope.revision}-${detailAtAsOf.layers.length}-${detailAtAsOf.milestones.length}`
      : null,
  });

  // 表示フィルタ (凡例ピルのトグル)。hide-set semantics:
  // 各 pill は独立にトグル可。set に入っているカテゴリだけが「非表示」扱い、
  // それ以外は表示。empty set = 全表示 (=デフォルト)。
  const [hiddenAllocKinds, setHiddenAllocKinds] = useState<Set<"First" | "Planned">>(new Set());
  const [hiddenAllocFlags, setHiddenAllocFlags] = useState<Set<"overflow" | "overBudget">>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // デフォルトは表示モード (milestone pins / FSRS slider を出さない)。
  // 編集したいときだけユーザーが toggle で開く。
  const [showMilestonePins, setShowMilestonePins] = useState(false);
  // tetris 最大段数 (null = full / auto)。FSRS panel 右に表示するボタンで切替。
  const [chartMaxRows, setChartMaxRows] = useState<number | null>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: "daysUntil", desc: false }]);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  // 凡例 status pills は hide-set (空 = 全表示、入っているのが非表示)
  const [hiddenLastStatuses, setHiddenLastStatuses] = useState<Set<string>>(new Set());
  // 過去実績 (throughput + past First) を隠す / 未解消エントリ (planned future) を隠す
  // 表示カテゴリ独立 toggle。default は Throughput OFF + Review/Forecast ON
  // (= 未来寄せの「現行 /review + projection」表示)。filter_prefs.plan で永続化。
  const [hideThroughput, setHideThroughput] = useState(true);
  const [hideNextStep, setHideNextStep] = useState(false);
  const [hideForecast, setHideForecast] = useState(false);

  // filter prefs 永続化 (Phase 7 で scope_id 単位、scope ごとに独立)
  const filterPrefsQuery = useFilterPrefs(scopeId ?? undefined);
  const saveFilterPrefs = useSaveFilterPrefs(scopeId ?? undefined);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scopeId || prefsLoadedRef.current === scopeId) return;
    if (filterPrefsQuery.data === undefined) return;
    const p = filterPrefsQuery.data?.plan;
    if (p) {
      setFilterSubjects(new Set(p.subjectIds ?? []));
      setFilterLevels(new Set(p.levelIds ?? []));
      setHiddenLastStatuses(new Set(p.hiddenLastStatuses ?? []));
      setHiddenAllocKinds(new Set(p.hiddenAllocKinds ?? []));
      setHiddenAllocFlags(new Set(p.hiddenAllocFlags ?? []));
      setHiddenLayerIds(new Set(p.hiddenLayerIds ?? []));
      if (p.chartMaxRows !== undefined) setChartMaxRows(p.chartMaxRows);
      setHideThroughput(!!p.hideThroughput);
      setHideNextStep(!!p.hideNextStep);
      setHideForecast(!!p.hideForecast);
    }
    prefsLoadedRef.current = scopeId;
  }, [scopeId, filterPrefsQuery.data]);
  const lastSavedPrefsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scopeId || prefsLoadedRef.current !== scopeId) return;
    const snapshot = JSON.stringify({
      s: [...filterSubjects].sort(),
      l: [...filterLevels].sort(),
      st: [...hiddenLastStatuses].sort(),
      k: [...hiddenAllocKinds].sort(),
      f: [...hiddenAllocFlags].sort(),
      h: [...hiddenLayerIds].sort(),
      r: chartMaxRows,
      ht: hideThroughput,
      hn: hideNextStep,
      hf: hideForecast,
    });
    if (lastSavedPrefsRef.current === null) {
      lastSavedPrefsRef.current = snapshot;
      return;
    }
    if (lastSavedPrefsRef.current === snapshot) return;
    lastSavedPrefsRef.current = snapshot;
    saveFilterPrefs.mutate({
      ...(filterPrefsQuery.data ?? {}),
      plan: {
        subjectIds: [...filterSubjects],
        levelIds: [...filterLevels],
        hiddenLastStatuses: [...hiddenLastStatuses],
        hiddenAllocKinds: [...hiddenAllocKinds],
        hiddenAllocFlags: [...hiddenAllocFlags],
        hiddenLayerIds: [...hiddenLayerIds],
        chartMaxRows,
        hideThroughput,
        hideNextStep,
        hideForecast,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSubjects, filterLevels, hiddenLastStatuses, hiddenAllocKinds, hiddenAllocFlags, hiddenLayerIds, chartMaxRows, hideThroughput, hideNextStep, hideForecast]);
  const chartRef = useRef<TetrisChartHandle>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector(`[data-problem-id="${id}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleDataChanged = useCallback(() => { /* invalidations handled inside mutation hooks */ }, []);
  const { openDetail, renderDialogs } = useProblemDialogs({
    fieldId,
    allProblems,
    onDataChanged: handleDataChanged,
  });

  // FSRS slider の live preview 用 local 状態。
  // ScopeFSRSOverridePanel の onLocalChange で受け取り、statusByName に反映。
  // null = まだ panel 側の初期化が走ってない (= saved override を使う)
  const [livePreviewOverride, setLivePreviewOverride] = useState<Record<string, number> | null>(null);

  const statusByName = useMemo(() => {
    const m = new Map<string, { stabilityDays: number; color: string | null }>();
    const override = livePreviewOverride ?? scopeQuery.data?.status_stabilities ?? {};
    for (const s of statuses) {
      const days = override[s.name] !== undefined ? override[s.name] : s.stabilityDays;
      m.set(s.name, { stabilityDays: days, color: s.color ?? null });
    }
    return m;
  }, [statuses, scopeQuery.data, livePreviewOverride]);

  const horizonDate = useMemo(() => addDays(today, PROJECTION_HORIZON_DAYS), [today]);

  // overlay assembly は lib に切り出し済。Plan は inputs を渡すだけ。
  const overlayItems = useMemo<OverlayBlock[]>(() => {
    if (!detail) return [];
    const memberStandardTimeById = new Map<string, number | null>();
    for (const m of detail.members) memberStandardTimeById.set(m.id, m.standard_time);
    return assembleOverlay({
      memberStandardTimeById,
      allocated: edit.allocated,
      reviews: reviewQuery.data ?? [],
      history: throughputQuery.data ?? [],
      statusByName,
      horizonDate,
      today,
    });
  }, [detail, edit.allocated, reviewQuery.data, throughputQuery.data, statusByName, horizonDate, today]);

  // problemId → {subjectId, levelId} の lookup (filter 用)
  const problemMeta = useMemo(() => {
    const m = new Map<string, { subjectId: string | null; levelId: string | null }>();
    if (detail) for (const p of detail.members) m.set(p.id, { subjectId: p.subject_id, levelId: p.level_id });
    return m;
  }, [detail]);

  const passesSubjectLevel = useCallback((problemId: string): boolean => {
    if (filterSubjects.size === 0 && filterLevels.size === 0) return true;
    const meta = problemMeta.get(problemId);
    if (!meta) return false;
    if (filterSubjects.size > 0 && (!meta.subjectId || !filterSubjects.has(meta.subjectId))) return false;
    if (filterLevels.size > 0 && (!meta.levelId || !filterLevels.has(meta.levelId))) return false;
    return true;
  }, [problemMeta, filterSubjects, filterLevels]);

  const filteredOverlay = useMemo(() => {
    return overlayItems.filter((o) => {
      // 左 = 実績
      if (hideThroughput && o.kind === "throughput") return false;
      // 中央 = 今すぐ 1 回のエントリ (overlay 側 = answered の next-step)。
      //        unanswered の initial は allocated.future 側で hide
      if (hideNextStep && o.kind === "next-step") return false;
      // 右 = forecast (= 全 cascade)
      if (hideForecast && o.kind === "forecast") return false;
      // hide-set: set にあるカテゴリだけ非表示
      if (o.statusName && hiddenLastStatuses.has(o.statusName)) return false;
      if (!passesSubjectLevel(o.problemId)) return false;
      return true;
    });
  }, [overlayItems, hiddenLastStatuses, hideThroughput, hideNextStep, hideForecast, passesSubjectLevel]);

  const filteredAllocated = useMemo(() => {
    return edit.allocated.filter((a) => {
      // 左 = 実績: hideThroughput は past allocated (= 初回回答済) を隠す
      if (hideThroughput && a.side === "past") return false;
      // 中央 = 今すぐ 1 回: hideNextStep は allocator の初回 (Unrated 未来) も含めて隠す
      // (next-step は unanswered の initial + answered の next-review の両方を包括する概念)
      if (hideNextStep && a.side === "future") return false;
      const kind = a.side === "past" ? "First" : "Planned";
      if (hiddenAllocKinds.has(kind)) return false;
      if (a.overflow && hiddenAllocFlags.has("overflow")) return false;
      if (a.overBudget && hiddenAllocFlags.has("overBudget")) return false;
      if (!passesSubjectLevel(a.problemId)) return false;
      return true;
    });
  }, [edit.allocated, hiddenAllocKinds, hiddenAllocFlags, hideThroughput, hideNextStep, passesSubjectLevel]);

  const memberCount = edit.effectiveMembers.length;
  const doneCount = edit.effectiveMembers.filter((m) => m.first_answer_date).length;

  // Table: review API の rows をそのまま review-page と同じ columns で表示。
  // scope filter は review.ts 側で scope_id 適用済 → 追加処理なし。
  const allScheduleRows = useMemo(() => (reviewQuery.data ?? []).map(toScheduleRow), [reviewQuery.data]);
  // chart で少なくとも 1 ブロック表示されている problem のみ table にも残す。
  // → Throughput/Review/Forecast の 3 toggle が table 側にも自然に効く。
  const visibleProblemIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of filteredAllocated) set.add(a.problemId);
    for (const o of filteredOverlay) set.add(o.problemId);
    return set;
  }, [filteredAllocated, filteredOverlay]);
  const scheduleRows = useMemo(() => allScheduleRows.filter((r) => {
    if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
    if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
    // hiddenLastStatuses は legend pill 用の chart 側 hide-set。table 側は
    // visibleProblemIds (= chart に 1 block 以上残った problem) で表現済なので
    // ここで status を再フィルタする必要はない (zero-answer Planned の lastStatus が
    // デフォルト status と一致して誤 drop する問題があった)。
    if (!visibleProblemIds.has(r.problemId)) return false;
    return true;
  }), [allScheduleRows, filterSubjects, filterLevels, visibleProblemIds]);
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of allScheduleRows) set.add(r.lastStatus);
    const orderMap = new Map(statuses.map((s) => [s.name, s.sortOrder]));
    return Array.from(set).sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  }, [allScheduleRows, statuses]);
  // 漏斗バッジは funnel 内のフィルタ (subject/level) と凡例 hide-set の合計。
  const activeFilterCount = filterSubjects.size + filterLevels.size + hiddenLastStatuses.size + hiddenAllocKinds.size + hiddenAllocFlags.size;
  const table = useReactTable({
    data: scheduleRows,
    columns: planScheduleColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const pdfExport = usePdfExport("plan");
  function centerDate(): string {
    return chartRef.current?.getCenterDate() ?? today;
  }

  const lastMs = [...edit.localMilestones].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const daysToDeadline = lastMs
    ? Math.round((new Date(`${lastMs.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
    : null;

  const toggleAllocKind = useCallback((k: "First" | "Planned") => {
    setHiddenAllocKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);
  const toggleAllocFlag = useCallback((k: "overflow" | "overBudget") => {
    setHiddenAllocFlags((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  // hide-set: set に入っていなければ表示中 (明るい)、入っていれば非表示 (暗い)。
  // 各 pill 独立にトグルできる。
  const isShownKind = (k: "First" | "Planned") => !hiddenAllocKinds.has(k);
  const isShownStatus = (name: string) => !hiddenLastStatuses.has(name);
  const isShownFlag = (k: "overflow" | "overBudget") => !hiddenAllocFlags.has(k);

  const legendEntries: LegendEntry[] = useMemo(() => [
    // 評価群 (ordinal): Miss → Solid
    ...statuses
      .filter((s) => availableStatuses.includes(s.name))
      .map<LegendEntry>((s) => ({
        kind: "fill",
        label: s.name,
        color: s.color ?? "#888",
        active: isShownStatus(s.name),
        onClick: () =>
          setHiddenLastStatuses((prev) => {
            const next = new Set(prev);
            if (next.has(s.name)) next.delete(s.name);
            else next.add(s.name);
            return next;
          }),
      })),
    { kind: "divider" },
    // 評価なし phase (past First + future Planned 同色、1 トグル)
    {
      kind: "fill",
      label: "New",
      color: COLOR_PLANNED,
      active: isShownKind("First") && isShownKind("Planned"),
      onClick: () => {
        const shown = isShownKind("First") && isShownKind("Planned");
        setHiddenAllocKinds(shown ? new Set(["First", "Planned"]) : new Set());
      },
    },
    { kind: "divider" },
    // メタ群: Planned に被せる警告 (ring)
    {
      kind: "ring",
      label: "Over budget",
      color: "#f59e0b",
      active: isShownFlag("overBudget"),
      onClick: () => toggleAllocFlag("overBudget"),
    },
    {
      kind: "ring",
      label: "Overflow",
      color: "#ef4444",
      active: isShownFlag("overflow"),
      onClick: () => toggleAllocFlag("overflow"),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hiddenAllocKinds, hiddenAllocFlags, hiddenLastStatuses, availableStatuses, statuses, toggleAllocKind, toggleAllocFlag]);

  // milestone anchor (= target 番目の problem id) を可視化用に算出
  const orderedMembers = useMemo(() => [...edit.effectiveMembers].sort((a, b) =>
    a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code)
  ), [edit.effectiveMembers]);
  const milestoneAnchors = useMemo(() => edit.localMilestones.map((ms) => ({
    target: ms.target,
    layer_id: ms.layer_id,
    problemId: orderedMembers[ms.target - 1]?.id ?? null,
  })), [edit.localMilestones, orderedMembers]);

  const handleSave = useCallback(async () => {
    try {
      await edit.save();
      toast.success("Saved");
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [edit]);

  if (!scopeId) {
    return (
      <div className="p-4 md:p-6 text-center py-12 text-muted-foreground">
        Select a scope from the top bar
      </div>
    );
  }
  if (!detail) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <TetrisChart
        toolbar={
          <>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" title="Filter"
                  className="relative inline-flex items-center justify-center size-6 rounded-md border shrink-0 transition-colors text-foreground hover:bg-muted">
                  <Filter className="size-3"/>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3 space-y-3" align="start">
                {(detail.subjects?.length ?? 0) > 0 && (
                  <FilterSection
                    label="Subject"
                    items={detail.subjects.map((s) => ({ value: s.id, label: s.name }))}
                    selected={filterSubjects}
                    onChange={setFilterSubjects}
                  />
                )}
                {(detail.levels?.length ?? 0) > 0 && (
                  <FilterSection
                    label="Level"
                    items={detail.levels.map((l) => ({ value: l.id, label: l.name }))}
                    selected={filterLevels}
                    onChange={setFilterLevels}
                  />
                )}
                {availableStatuses.length > 1 && (
                  <FilterSection
                    label="Status"
                    items={availableStatuses.map((s) => ({ value: s, label: s }))}
                    selected={hiddenLastStatuses}
                    onChange={setHiddenLastStatuses}
                  />
                )}
                {activeFilterCount > 0 && (
                  <button type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                    onClick={() => {
                      setFilterSubjects(new Set()); setFilterLevels(new Set());
                      setHiddenLastStatuses(new Set()); setHiddenAllocKinds(new Set()); setHiddenAllocFlags(new Set());
                    }}>
                    Clear filters
                  </button>
                )}
              </PopoverContent>
            </Popover>
            <KindToggles
              hideThroughput={hideThroughput}
              hideNextStep={hideNextStep}
              hideForecast={hideForecast}
              setHideThroughput={setHideThroughput}
              setHideNextStep={setHideNextStep}
              setHideForecast={setHideForecast}
            />
            {(historyPanelOpen || asOf != null) && (
              <div className="flex-1 min-w-0 h-[26px] rounded-md border px-2 flex items-center text-xs">
                <AsOfControls
                  asOf={asOf}
                  setAsOf={setAsOf}
                  latest={realToday}
                  onClose={() => setHistoryPanelOpen(false)}
                />
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <PdfExportButton
                selectedCount={pdfExport.selected.size}
                exporting={pdfExport.exporting}
                phase={pdfExport.phase}
                upstream={pdfExport.upstream}
                onClick={() => pdfExport.exportPdf(today)}
              />

              {edit.dirty && !readOnly && (
                <>
                  <button type="button"
                    onClick={edit.reset}
                    disabled={edit.isSaving}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Discard changes">
                    <RotateCcw className="size-3"/>Reset
                  </button>
                  <Button size="sm" onClick={handleSave} disabled={edit.isSaving}
                    className="h-7 text-xs">
                    {edit.isSaving ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
                    {edit.isSaving ? "Saving..." : "Save"}
                  </Button>
                </>
              )}
              <button type="button"
                title="As-of view / replay" aria-pressed={historyPanelOpen || asOf != null}
                className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${
                  asOf != null
                    ? "border-primary/50 text-primary"
                    : historyPanelOpen
                      ? "bg-accent text-accent-foreground border-accent-foreground/20"
                      : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setHistoryPanelOpen((p) => !p)}>
                <History className="size-3"/>
              </button>
              <button type="button"
                title="Toggle milestone pins / FSRS slider" aria-pressed={showMilestonePins}
                className={`inline-flex items-center justify-center size-[26px] rounded-md border transition-colors ${showMilestonePins ? "bg-accent text-accent-foreground border-accent-foreground/20" : "text-muted-foreground hover:bg-muted"}`}
                onClick={() => setShowMilestonePins((p) => !p)}>
                <SlidersHorizontal className="size-3"/>
              </button>
            </div>
          </>
        }
        aboveChart={showMilestonePins && scopeQuery.data && (
          <div className="-mt-1 -mb-1 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <ScopeFSRSOverridePanel
                key={`${scopeQuery.data.revision}-${asOf ?? "live"}`}
                statuses={statuses}
                current={scopeQuery.data.status_stabilities ?? {}}
                disabled={readOnly}
                onSave={(next) =>
                  updateScope.mutateAsync({ id: scopeId, payload: { status_stabilities: next } })
                }
                onLocalChange={setLivePreviewOverride}
              />
            </div>
            <ChartHeightPicker value={chartMaxRows} onChange={setChartMaxRows}/>
          </div>
        )}
        belowChart={
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <BlockLegend entries={legendEntries} />
          </div>
        }
          ref={chartRef}
          realToday={realToday}
          onTodayDrag={(d) => setAsOf(d === realToday ? null : d)}
          maxStackOverride={chartMaxRows}
          items={filteredAllocated}
          overlayItems={filteredOverlay}
          layers={edit.localLayers.map((l) => {
            const ms = edit.localMilestones.filter((m) => m.layer_id === l.id);
            const maxTarget = ms.reduce((acc, m) => Math.max(acc, m.target), 0);
            return { ...l, progress: maxTarget > 0 ? { done: Math.min(doneCount, maxTarget), total: maxTarget } : null };
          })}
          milestones={edit.localMilestones}
          today={today}
          selectedId={selectedId}
          onSelect={handleSelect}
          onOpen={openDetail}
          showMilestonePins={showMilestonePins}
          milestoneAnchors={milestoneAnchors}
          hiddenLayerIds={hiddenLayerIds}
          onHiddenLayersChange={setHiddenLayerIds}
          rightPanelExtra={
            <ScopePlanRightPanel
              dailyMinutes={edit.dailyMinutes}
              setDailyMinutes={edit.setDailyMinutes}
              timeMultiplier={edit.timeMultiplier}
              setTimeMultiplier={edit.setTimeMultiplier}
              weekdayWeights={edit.weekdayWeights}
              setWeekdayWeights={edit.setWeekdayWeights}
              deadlineDate={lastMs?.date}
              daysToDeadline={daysToDeadline}
              readOnly={readOnly}
            />
          }
          {...(readOnly ? {} : {
            onMilestoneDateDraft: edit.handlers.onMilestoneDateDraft,
            onMilestoneDateChange: edit.handlers.onMilestoneDateChange,
            onMilestoneLayerDraft: edit.handlers.onMilestoneLayerDraft,
            onMilestoneLayerChange: edit.handlers.onMilestoneLayerChange,
            onMilestoneTargetChange: edit.handlers.onMilestoneTargetChange,
            onMilestoneRemove: edit.handlers.onMilestoneRemove,
            onMilestoneAddToLayer: (layerId: string, atDate?: string) =>
              edit.handlers.onMilestoneAddToLayer(layerId, atDate, centerDate(), memberCount),
            onLayerNameChange: edit.handlers.onLayerNameChange,
            onLayerColorChange: edit.handlers.onLayerColorChange,
            onLayerStyleChange: edit.handlers.onLayerStyleChange,
            onLayerRemove: edit.handlers.onLayerRemove,
            onAddLayer: edit.handlers.onAddLayer,
            onReorderLayers: edit.handlers.onReorderLayers,
          })}
      />

      {scheduleRows.length > 0 && (
        <ResizableTableShell ref={tableRef}>
          <Table className="table-fixed">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur w-10 px-3">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary cursor-pointer"
                        checked={pdfExport.selected.size > 0 && pdfExport.selected.size === scheduleRows.length}
                        ref={(el) => { if (el) el.indeterminate = pdfExport.selected.size > 0 && pdfExport.selected.size < scheduleRows.length; }}
                        onChange={() => {
                          if (pdfExport.selected.size > 0) pdfExport.clear();
                          else pdfExport.setAll(scheduleRows.map((r) => r.problemId));
                        }}
                      />
                    </div>
                  </TableHead>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="sticky top-0 z-10 bg-muted/80 backdrop-blur"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const pid = row.original.problemId;
                return (
                  <TableRow
                    key={row.id}
                    data-problem-id={pid}
                    className={`cursor-pointer ${pid === selectedId ? "bg-accent" : ""}`}
                    onClick={() => pid === selectedId ? openDetail(pid) : handleSelect(pid)}
                    onDoubleClick={() => openDetail(pid)}
                  >
                    <TableCell className="w-10 px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary cursor-pointer"
                          checked={pdfExport.selected.has(pid)}
                          onChange={() => pdfExport.toggle(pid)}
                        />
                      </div>
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
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

function ChartHeightPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "10");
  useEffect(() => { if (value != null) setDraft(String(value)); }, [value]);
  const numericActive = value != null;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] text-muted-foreground">Height</span>
      <div className="inline-flex rounded-md border text-[10px] overflow-hidden">
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            const n = parseInt(draft, 10);
            if (Number.isFinite(n) && n >= 10) onChange(n);
            else setDraft(value != null ? String(value) : "10");
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={`w-9 px-2 py-0.5 text-center tabular-nums bg-transparent outline-none transition-colors ${
            numericActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
          }`}/>
        <button type="button"
          className={`px-2 py-0.5 border-l transition-colors ${value == null ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
          onClick={() => onChange(null)}>
          Full
        </button>
      </div>
    </div>
  );
}

