"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
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
import { useReviewList } from "@/hooks/queries/use-review";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useScopes, useScope, useScopeDetail, useScopeTimeline, useUpdateScope, sliceTimelineAtAsOf } from "@/hooks/queries/use-scopes";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle } from "@/lib/page-context";
import { todayJST } from "@/lib/date-utils";
import { computeNextReview } from "@/lib/review-scoring";
import { BacklogChart, type BacklogChartHandle, type OverlayBlock } from "@/components/backlog-chart";
import { ScopePlanRightPanel } from "@/components/scope-plan-right-panel";
import { ScopeFSRSOverridePanel } from "@/components/scope-fsrs-override-panel";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";
import { COLOR_PLANNED, COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { useThroughputList } from "@/hooks/queries/use-throughput";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { AsOfControls } from "@/components/as-of-controls";
import { FilterSection } from "@/components/filter-section";
import { reviewTableColumns, toScheduleRow } from "@/components/review-table-columns";
import { useScopeEditState } from "@/hooks/use-scope-edit-state";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";

/** 順調な status 進行順 (= 各 review を smooth に通した場合の遷移) */
const SMOOTH_CHAIN = ["Rough", "Fair", "Fluent", "Done"] as const;
/** Done の繰り返しはこの期間まで */
const PROJECTION_HORIZON_DAYS = 365 * 2;

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 順調進行を仮定して将来 review 日を生成する。
 *  - currentStatus が SMOOTH_CHAIN に無ければ (First / Miss など) → chain 先頭から開始
 *  - Done に到達後はそのまま Done インターバルで horizon までループ
 */
function projectSmoothFuture(args: {
  problemId: string;
  code: string;
  name: string | null;
  startDate: string;
  startStatus: string;
  standardTimeSec: number | null;
  lastDurationSec: number | null;
  statusByName: Map<string, { stabilityDays: number; color: string | null }>;
  horizonDate: string;
}): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  let date = args.startDate;
  let chainIdx = SMOOTH_CHAIN.indexOf(args.startStatus as (typeof SMOOTH_CHAIN)[number]);
  let safety = 200;
  while (safety-- > 0) {
    const nextIdx = Math.min(chainIdx + 1, SMOOTH_CHAIN.length - 1);
    const nextStatusName = SMOOTH_CHAIN[nextIdx];
    const info = args.statusByName.get(nextStatusName);
    if (!info || info.stabilityDays <= 0) break;
    const projected = computeNextReview(date, info.stabilityDays, args.standardTimeSec, args.lastDurationSec);
    if (projected <= date) break;
    if (projected > args.horizonDate) break;
    // 実効 interval (= projected - date) を stabilityDays として渡す。
    // info.stabilityDays をそのまま使うと status 一様になるので、std/dur で
    // 補正された個別の interval を反映する。
    const intervalDays = Math.round(
      (new Date(`${projected}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86400000,
    );
    out.push({
      problemId: args.problemId,
      code: args.code,
      name: args.name,
      date: projected,
      color: info.color ?? "#a3a3a3",
      statusName: nextStatusName,
      stabilityDays: intervalDays,
    });
    date = projected;
    chainIdx = nextIdx;
  }
  return out;
}

export default function PlanPage() {
  usePageTitle("Plan");
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
  const reviewQuery = useReviewList(fieldId ?? undefined, null, scopeId ?? undefined);
  // Past throughput (= 過去 answer 履歴)。1 answer = 1 ブロックを overlay として今日より前に積む。
  // asOf 再生時は asOf 以前のみ表示するため、client 側 filter で対応。
  const throughputQuery = useThroughputList(undefined, null, scopeId ?? undefined);

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

  // 表示フィルタ (凡例ピルのトグル)。すべて select-only semantics:
  // 空集合 = 全表示、要素あり = それだけ表示 (ピルは active 強調)。
  const [allocKindFilter, setAllocKindFilter] = useState<Set<"First" | "Planned">>(new Set());
  const [allocFlagFilter, setAllocFlagFilter] = useState<Set<"overflow" | "overBudget">>(new Set());
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
  const [filterLastStatuses, setFilterLastStatuses] = useState<Set<string>>(new Set());
  // 過去実績 (throughput + past First) を隠す / 未解消エントリ (planned future) を隠す
  const [hideThroughput, setHideThroughput] = useState(false);
  const [hidePlanned, setHidePlanned] = useState(false);

  // filter prefs 永続化 (review/scopes と同じ filter_prefs テーブル、key=plan)
  const filterPrefsQuery = useFilterPrefs(fieldId ?? undefined);
  const saveFilterPrefs = useSaveFilterPrefs(fieldId ?? undefined);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fieldId || prefsLoadedRef.current === fieldId) return;
    if (filterPrefsQuery.data === undefined) return;
    const p = filterPrefsQuery.data?.plan;
    if (p) {
      setFilterSubjects(new Set(p.subjectIds ?? []));
      setFilterLevels(new Set(p.levelIds ?? []));
      setFilterLastStatuses(new Set(p.lastStatuses ?? []));
      const kinds = new Set<"First" | "Planned">();
      if (p.allocKinds) for (const k of p.allocKinds) kinds.add(k);
      setAllocKindFilter(kinds);
      const flags = new Set<"overflow" | "overBudget">();
      if (p.allocFlags) for (const k of p.allocFlags) flags.add(k);
      setAllocFlagFilter(flags);
      setHiddenLayerIds(new Set(p.hiddenLayerIds ?? []));
      if (p.chartMaxRows !== undefined) setChartMaxRows(p.chartMaxRows);
      setHideThroughput(!!p.hideThroughput);
      setHidePlanned(!!p.hidePlanned);
    }
    prefsLoadedRef.current = fieldId;
  }, [fieldId, filterPrefsQuery.data]);
  const lastSavedPrefsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fieldId || prefsLoadedRef.current !== fieldId) return;
    const snapshot = JSON.stringify({
      s: [...filterSubjects].sort(),
      l: [...filterLevels].sort(),
      st: [...filterLastStatuses].sort(),
      k: [...allocKindFilter].sort(),
      f: [...allocFlagFilter].sort(),
      h: [...hiddenLayerIds].sort(),
      r: chartMaxRows,
      ht: hideThroughput,
      hp: hidePlanned,
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
        lastStatuses: [...filterLastStatuses],
        allocKinds: [...allocKindFilter],
        allocFlags: [...allocFlagFilter],
        hiddenLayerIds: [...hiddenLayerIds],
        chartMaxRows,
        hideThroughput,
        hidePlanned,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSubjects, filterLevels, filterLastStatuses, allocKindFilter, allocFlagFilter, hiddenLayerIds, chartMaxRows, hideThroughput, hidePlanned]);
  const chartRef = useRef<BacklogChartHandle>(null);
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

  const statusByName = useMemo(() => {
    const m = new Map<string, { stabilityDays: number; color: string | null }>();
    const override = scopeQuery.data?.status_stabilities ?? {};
    for (const s of statuses) {
      const days = override[s.name] !== undefined ? override[s.name] : s.stabilityDays;
      m.set(s.name, { stabilityDays: days, color: s.color ?? null });
    }
    return m;
  }, [statuses, scopeQuery.data]);

  const horizonDate = useMemo(() => addDays(today, PROJECTION_HORIZON_DAYS), [today]);

  // FSRS-projected smooth-future overlay (allocated 上に積む)
  const overlayItems = useMemo<OverlayBlock[]>(() => {
    if (!detail) return [];
    const out: OverlayBlock[] = [];
    // backlog 未来 (= 初回予定日) からは smooth-future を投影
    const memberStd = new Map<string, number | null>();
    for (const m of detail.members) memberStd.set(m.id, m.standard_time);
    for (const a of edit.allocated) {
      if (a.side !== "future") continue;
      out.push(
        ...projectSmoothFuture({
          problemId: a.problemId,
          code: a.code,
          name: a.name,
          startDate: a.date,
          startStatus: "First",
          standardTimeSec: memberStd.get(a.problemId) ?? null,
          lastDurationSec: null,
          statusByName,
          horizonDate,
        }),
      );
    }
    // 既に答えたことがある問題 (review 持ち) の next review + smooth-future
    for (const r of reviewQuery.data ?? []) {
      if (r.answerCount === 0) continue;
      const stColor = r.statusColor ?? "#a3a3a3";
      // r.nextReview は server で std/dur 補正済み next review 日。今日からの interval
      // を stabilityDays として渡し、同 status の中でも問題ごとに stability が
      // 違うようにする。
      const reviewIntervalDays = Math.max(0, Math.round(
        (new Date(`${r.nextReview}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
      ));
      out.push({
        problemId: r.problemId,
        code: r.code,
        name: r.name,
        date: r.nextReview,
        color: stColor,
        statusName: r.lastStatus,
        stabilityDays: reviewIntervalDays,
      });
      out.push(
        ...projectSmoothFuture({
          problemId: r.problemId,
          code: r.code,
          name: r.name,
          startDate: r.nextReview,
          startStatus: r.lastStatus,
          standardTimeSec: r.standardTime ?? null,
          lastDurationSec: r.lastDuration ?? null,
          statusByName,
          horizonDate,
        }),
      );
    }
    // 過去実績 (throughput) を opacity 0.5 で overlay。allocated past (= first attempt) と
    // 重複しないよう、prevStatus 非 null の re-answer のみ採用。
    // asOf 再生時はチャート上 today より右の点が今日扱いになるので today 比較で十分。
    for (const r of throughputQuery.data ?? []) {
      if (r.date >= today) continue;            // 未来 / 当日は overlay しない
      if (!r.prevStatusColor) continue;          // 初回回答は allocated past 側で表示済
      out.push({
        problemId: r.problemId,
        code: r.code,
        name: r.name,
        date: r.date,
        color: r.prevStatusColor,
        statusName: r.prevStatusName,
        opacity: 0.5,
      });
    }
    return out;
  }, [detail, edit.allocated, reviewQuery.data, statusByName, horizonDate, throughputQuery.data, today]);

  const filteredOverlay = useMemo(() => {
    return overlayItems.filter((o) => {
      // 過去 throughput overlay は stabilityDays 無し (= 実績)、未来 overlay は有り
      const isActual = o.stabilityDays === undefined;
      if (hideThroughput && isActual) return false;
      if (hidePlanned && !isActual) return false;
      if (filterLastStatuses.size > 0 && (!o.statusName || !filterLastStatuses.has(o.statusName))) return false;
      return true;
    });
  }, [overlayItems, filterLastStatuses, hideThroughput, hidePlanned]);

  const filteredAllocated = useMemo(() => {
    return edit.allocated.filter((a) => {
      if (hideThroughput && a.side === "past") return false;
      if (hidePlanned && a.side === "future") return false;
      if (allocKindFilter.size > 0) {
        const kind = a.side === "past" ? "First" : "Planned";
        if (!allocKindFilter.has(kind)) return false;
      }
      if (allocFlagFilter.size > 0) {
        const matchOverflow = allocFlagFilter.has("overflow") && a.overflow;
        const matchOverBudget = allocFlagFilter.has("overBudget") && a.overBudget;
        if (!matchOverflow && !matchOverBudget) return false;
      }
      return true;
    });
  }, [edit.allocated, allocKindFilter, allocFlagFilter, hideThroughput, hidePlanned]);

  const memberCount = edit.effectiveMembers.length;
  const doneCount = edit.effectiveMembers.filter((m) => m.first_answer_date).length;

  // Table: review API の rows をそのまま review-page と同じ columns で表示。
  // scope filter は review.ts 側で scope_id 適用済 → 追加処理なし。
  const allScheduleRows = useMemo(() => (reviewQuery.data ?? []).map(toScheduleRow), [reviewQuery.data]);
  const scheduleRows = useMemo(() => allScheduleRows.filter((r) => {
    if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
    if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
    if (filterLastStatuses.size > 0 && !filterLastStatuses.has(r.lastStatus)) return false;
    return true;
  }), [allScheduleRows, filterSubjects, filterLevels, filterLastStatuses]);
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of allScheduleRows) set.add(r.lastStatus);
    const orderMap = new Map(statuses.map((s) => [s.name, s.sortOrder]));
    return Array.from(set).sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  }, [allScheduleRows, statuses]);
  const activeFilterCount = filterSubjects.size + filterLevels.size + filterLastStatuses.size;
  const table = useReactTable({
    data: scheduleRows,
    columns: reviewTableColumns,
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
    setAllocKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);
  const toggleAllocFlag = useCallback((k: "overflow" | "overBudget") => {
    setAllocFlagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const legendEntries: LegendEntry[] = useMemo(() => [
    {
      kind: "fill",
      label: "First",
      color: COLOR_FIRST_ATTEMPT,
      active: allocKindFilter.has("First"),
      onClick: () => toggleAllocKind("First"),
    },
    {
      kind: "fill",
      label: "Planned",
      color: COLOR_PLANNED,
      active: allocKindFilter.has("Planned"),
      onClick: () => toggleAllocKind("Planned"),
    },
    ...statuses
      .filter((s) => availableStatuses.includes(s.name))
      .map<LegendEntry>((s) => ({
        kind: "fill",
        label: s.name,
        color: s.color ?? "#888",
        active: filterLastStatuses.has(s.name),
        onClick: () =>
          setFilterLastStatuses((prev) => {
            const next = new Set(prev);
            if (next.has(s.name)) next.delete(s.name);
            else next.add(s.name);
            return next;
          }),
      })),
    {
      kind: "ring",
      label: "Over budget",
      color: "#f59e0b",
      active: allocFlagFilter.has("overBudget"),
      onClick: () => toggleAllocFlag("overBudget"),
    },
    {
      kind: "ring",
      label: "Overflow",
      color: "#ef4444",
      active: allocFlagFilter.has("overflow"),
      onClick: () => toggleAllocFlag("overflow"),
    },
  ], [allocKindFilter, allocFlagFilter, filterLastStatuses, availableStatuses, statuses, toggleAllocKind, toggleAllocFlag]);

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
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 px-2 relative shrink-0" title="Filter">
                <Filter className="size-3"/>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
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
                  selected={filterLastStatuses}
                  onChange={setFilterLastStatuses}
                />
              )}
              {activeFilterCount > 0 && (
                <button type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                  onClick={() => { setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterLastStatuses(new Set()); }}>
                  フィルター解除
                </button>
              )}
            </PopoverContent>
          </Popover>
          {/* Throughput / Planned 表示 toggle。active なら 該当データを隠す。 */}
          <button type="button"
            onClick={() => setHideThroughput((v) => !v)}
            title={hideThroughput ? "実績を表示" : "実績を非表示"}
            className={`h-6 px-2 text-[10px] rounded-md border transition-colors shrink-0 ${
              hideThroughput
                ? "bg-accent text-accent-foreground border-accent-foreground/30"
                : "text-muted-foreground hover:bg-muted"
            }`}>
            {hideThroughput ? "実績 OFF" : "実績"}
          </button>
          <button type="button"
            onClick={() => setHidePlanned((v) => !v)}
            title={hidePlanned ? "予定を表示" : "予定を非表示"}
            className={`h-6 px-2 text-[10px] rounded-md border transition-colors shrink-0 ${
              hidePlanned
                ? "bg-accent text-accent-foreground border-accent-foreground/30"
                : "text-muted-foreground hover:bg-muted"
            }`}>
            {hidePlanned ? "予定 OFF" : "予定"}
          </button>
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
            {pdfExport.selected.size > 0 && (
              <Button
                size="sm" variant="outline" className="h-6 text-[10px] px-2"
                onClick={() => pdfExport.exportPdf(today)} disabled={pdfExport.exporting}>
                {pdfExport.exporting
                  ? <Loader2 className="size-3 mr-1 animate-spin"/>
                  : <Download className="size-3 mr-1"/>}
                {pdfExport.exporting
                  ? pdfExport.phase === "waking" ? "Render 起床中..."
                    : pdfExport.phase === "generating" ? "PDF 処理中..."
                      : pdfExport.phase === "downloading" ? "ダウンロード中..."
                        : "エクスポート中..."
                  : `PDF (${pdfExport.selected.size})`}
              </Button>
            )}
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
        </div>
        {showMilestonePins && scopeQuery.data && (
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
              />
            </div>
            <ChartHeightPicker value={chartMaxRows} onChange={setChartMaxRows}/>
          </div>
        )}
        <BacklogChart
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
          onSelect={(id) => setSelectedId((p) => (p === id ? null : id))}
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
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <BlockLegend entries={legendEntries} />
        </div>
      </div>

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

