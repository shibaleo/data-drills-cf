"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Download, Filter, Loader2, RotateCcw, Save, SlidersHorizontal, ArrowLeft, Archive, History, ListFilter, MoreVertical, Check, X } from "lucide-react";
import { useReviewScope, useReviewScopeRevisions, useUpdateReviewScope, useArchiveReviewScope } from "@/hooks/queries/use-review-scopes";
import { StabilitySlider } from "@/components/stability-slider";
import { applyMemberFilter } from "@/lib/member-filter";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { AsOfControls } from "@/components/as-of-controls";
import { Input } from "@/components/ui/input";
import { computeNextReview, computeDaysOverdue } from "@/lib/review-scoring";
import { problemColor } from "@/lib/problem-color";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc-client";
import { useField } from "@/hooks/use-field";
import { useSubjects, useLevels } from "@/hooks/queries/use-field-data";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";
import { usePageTitle, useHeaderSlot, usePageBack } from "@/lib/page-context";
import { OpaqueTag } from "@/components/problem-card";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useReviewList, reviewKeys } from "@/hooks/queries/use-review";
import { useProblemsList, problemsKeys } from "@/hooks/queries/use-problems";
import { useUpdateStatus } from "@/hooks/queries/use-statuses";
import { SortHeader } from "@/components/sort-header";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";
import { FilterSection } from "@/components/filter-section";
import { CELL, STEP, MIN_ROWS } from "@/lib/chart-constants";
import { ChartShell, DEFAULT_TOP_AXIS_H, DEFAULT_BOTTOM_AXIS_H } from "@/components/chart-shell";
import { toJSTDateString } from "@/lib/date-utils";
import { StatusTag } from "@/components/color-tags";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReviewRow as ReviewApiRow } from "@/hooks/queries/use-review";
import { formatRelDay } from "@/lib/relative-day";

/* ── Row types ── */

/** Display row — adds reviewCount for the "next 4 weeks" forecast cell. */
interface ScheduleRow extends Omit<ReviewApiRow, "answerCount"> {
  reviewCount: number;
  standardTime: number | null;
}

/* ── Schedule Chart (SVG) ── */

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type ChartColorMode = "problem" | "status";

function ReviewChart({
  items,
  today,
  realToday,
  onSelect,
  onOpen,
  selectedId,
  colorMode = "problem",
  statusOrderMap,
  onTodayDrag,
}: {
  items: ScheduleRow[];
  /** cursor 線位置 (asOf ?? realToday)。 */
  today: string;
  /** 日付軸ラベル基準。デフォルトは today */
  realToday?: string;
  onSelect?: (problemId: string) => void;
  onOpen?: (problemId: string) => void;
  selectedId?: string | null;
  colorMode?: ChartColorMode;
  statusOrderMap: Map<string, number>;
  onTodayDrag?: (newDate: string) => void;
}) {
  const axisToday = realToday ?? today;
  // Group items by nextReview date
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const item of items) {
      const list = map.get(item.nextReview) ?? [];
      list.push(item);
      map.set(item.nextReview, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (statusOrderMap.get(a.lastStatus) ?? 0) - (statusOrderMap.get(b.lastStatus) ?? 0));
    }
    return map;
  }, [items]);

  // Date range: cover all data with padding
  const dates = useMemo(() => {
    const reviewDates = items.map((i) => i.nextReview);
    const allDates = [today, ...reviewDates];
    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));

    const rangeStart = addDays(minDate < today ? minDate : today, -7);
    const rangeEnd = addDays(maxDate > today ? maxDate : today, 14);

    const ds: string[] = [];
    let d = rangeStart;
    while (d <= rangeEnd) {
      ds.push(d);
      d = addDays(d, 1);
    }
    return ds;
  }, [items, today]);

  const todayIdx = dates.indexOf(today);
  const axisIdx = dates.indexOf(axisToday);
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);
  const TOP_AXIS_H = DEFAULT_TOP_AXIS_H;
  const BOTTOM_AXIS_H = DEFAULT_BOTTOM_AXIS_H;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 5; i <= maxStack; i += 5) ticks.push(i);
    return ticks;
  }, [maxStack]);

  return (
    <ChartShell
      dates={dates}
      cursorDate={today}
      maxStack={maxStack}
      yAxisLabels={yTicks}
      onCursorDrag={onTodayDrag}
    >
      {dates.map((date, colIdx) => {
          const dayItems = grouped.get(date) ?? [];
          const x = colIdx * STEP;
          // 軸ハイライト・日付ラベルは現実の今日 (axisToday) 基準
          const isToday = date === axisToday;

          return (
            <g key={date}>
              {/* Today 列ハイライト・空セルグリッドは ChartShell 内で描画済 (pointer-events 無効) */}
              {/* Filled blocks */}
              {dayItems.map((item, stackIdx) => {
                const bx = x;
                const by = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                const isSelected = item.problemId === selectedId;
                const blockColor = colorMode === "status" ? item.statusColor : item.color;
                return (
                  <g key={item.problemId}>
                    {isSelected && (
                      <rect
                        x={bx - 2}
                        y={by - 2}
                        width={CELL + 4}
                        height={CELL + 4}
                        rx={3}
                        fill="none"
                        stroke={blockColor}
                        strokeWidth={2}
                        opacity={0.9}
                        className="animate-pulse"
                      />
                    )}
                    <rect
                      x={bx}
                      y={by}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      fill={blockColor}
                      opacity={isSelected ? 1 : 0.85}
                      className="cursor-pointer"
                      onClick={() => isSelected ? onOpen?.(item.problemId) : onSelect?.(item.problemId)}
                      onDoubleClick={() => onOpen?.(item.problemId)}
                    >
                      <title>
                        {item.code} {item.name}
                      </title>
                    </rect>
                  </g>
                );
              })}
              {/* Top axis: absolute dates (現実の今日基準) */}
              {(() => {
                const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                if (diff % 7 !== 0) return null;
                return (
                  <text
                    x={x + CELL / 2}
                    y={10}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {`${new Date(date + "T12:00:00").getMonth() + 1} / ${new Date(date + "T12:00:00").getDate()}`}
                  </text>
                );
              })()}
              {/* Bottom axis: relative days (現実の今日基準) */}
              {(() => {
                const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                if (diff % 7 !== 0) return null;
                const label = formatRelDay(diff);
                return (
                  <text
                    x={x + CELL / 2}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {label}
                  </text>
                );
              })()}
            </g>
          );
        })}
    </ChartShell>
  );
}

/* ── Column defs ── */

const columns: ColumnDef<ScheduleRow>[] = [
  {
    accessorKey: "lastStatus",
    header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
    cell: ({ row }) => {
      return <StatusTag status={row.original.lastStatus} color={row.original.statusColor} opaque className="text-[10px]" />;
    },
    size: 70,
  },
  {
    accessorKey: "subjectName",
    header: ({ column }) => <SortHeader column={column}>Subject</SortHeader>,
    cell: ({ row }) => row.original.subjectName ? (
      <OpaqueTag name={row.original.subjectName} color={row.original.subjectColor} />
    ) : null,
    size: 70,
  },
  {
    accessorKey: "levelName",
    header: ({ column }) => <SortHeader column={column}>Level</SortHeader>,
    cell: ({ row }) => row.original.levelName ? (
      <OpaqueTag name={row.original.levelName} color={row.original.levelColor} />
    ) : null,
    size: 70,
  },
  {
    accessorKey: "code",
    header: ({ column }) => <SortHeader column={column}>Code</SortHeader>,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>()}</span>
    ),
    size: 64,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
    cell: ({ getValue }) => (
      <span className="truncate block text-xs">
        {getValue<string>()}
      </span>
    ),
    size: 240,
  },
  {
    accessorKey: "daysUntil",
    header: ({ column }) => <SortHeader column={column}>Days</SortHeader>,
    size: 64,
    cell: ({ getValue }) => {
      const d = getValue<number>();
      return (
        <span
          className={`text-xs tabular-nums font-medium ${
            d < 0
              ? "text-red-500"
              : d === 0
                ? "text-foreground"
                : "text-muted-foreground"
          }`}
        >
          {formatRelDay(d)}
        </span>
      );
    },
  },
  {
    accessorKey: "nextReview",
    header: ({ column }) => <SortHeader column={column}>Next</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {getValue<string>()}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "reviewCount",
    header: ({ column }) => <SortHeader column={column}>Ans</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {getValue<number>()}
      </span>
    ),
    size: 64,
  },
];

/* ── Page ── */

export default function SchedulePage() {
  usePageTitle("Review");
  const renderHeaderSlot = useHeaderSlot();
  const { scope_id: scopeId } = useParams({ strict: false }) as { scope_id: string };
  const navigate = useNavigate();
  usePageBack(useCallback(() => navigate({ to: "/review" as string }), [navigate]));
  const { statuses, setCurrentScopeId } = useField();

  const [asOf, setAsOf] = useState<string | null>(null);
  const readOnly = asOf != null;
  // 注: asOf はチャート側の client-side フィルタ専用にし、エンティティ取得は常に最新を引く。
  const scopeQuery = useReviewScope(scopeId);
  const scopeFieldId = scopeQuery.data?.scope?.field_id ?? null;
  const { data: subjects = [] } = useSubjects(scopeFieldId ?? undefined);
  const { data: levels = [] } = useLevels(scopeFieldId ?? undefined);
  const revisionsQuery = useReviewScopeRevisions(scopeId);
  const updateScope = useUpdateReviewScope(scopeId, scopeFieldId ?? undefined);
  const archiveScope = useArchiveReviewScope(scopeFieldId ?? undefined);
  useEffect(() => { setCurrentScopeId(scopeId); }, [scopeId, setCurrentScopeId]);

  // Local editable state (backlog ミラー)
  const [localName, setLocalName] = useState("");
  const [localFilter, setLocalFilter] = useState<MemberFilterInput>({});
  const [localScopeId, setLocalScopeId] = useState<string | null>(null);
  const [membersEditorOpen, setMembersEditorOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const lastSyncRevRef = useRef<number | null>(null);
  useEffect(() => {
    const sc = scopeQuery.data?.scope;
    if (!sc) return;
    if (lastSyncRevRef.current === sc.revision) return;
    lastSyncRevRef.current = sc.revision;
    setLocalName(sc.name);
    setLocalFilter(sc.filter ?? {});
    setLocalScopeId(sc.scope_id ?? null);
    // canonical scope_id を localStorage に保存 → /review entry が次回これに戻る
    if (sc.scope_id && typeof window !== "undefined") {
      localStorage.setItem("dd_last_scope_id", sc.scope_id);
    }
  }, [scopeQuery.data]);

  // Build status name → sortOrder map from DB statuses
  const statusOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of statuses) m.set(s.name, s.sortOrder);
    return m;
  }, [statuses]);

  const qc = useQueryClient();

  // /problems-list — full problem + answer data (for client-side asOf recomputation)
  const dialogProblemsQuery = useProblemsList(scopeFieldId ?? undefined);
  const allProblems = dialogProblemsQuery.data ?? [];

  // Fast path: /api/v1/review (driven by TanStack Query)
  // 注: asOf を渡さない。asOf 適用はクライアント計算で行い、アニメーション再生時の
  // サーバ往復を回避する。
  const scheduleQuery = useReviewList(scopeFieldId ?? undefined);
  const serverRows = useMemo<ScheduleRow[]>(() => {
    // Review は forecast view: cursor (asOf) を過去にすると「その時点で
    // 知っていた answer だけで再計算した schedule」を見せる。
    if (asOf && allProblems.length > 0) {
      const defaultStatus = statuses[0];
      const statusByName = new Map(statuses.map((s) => [s.name, s]));
      const filtered = allProblems
        .filter((p) => {
          // scope の member filter で絞り込み
          if (localFilter.subjectIds?.length && (!p.subject_id || !localFilter.subjectIds.includes(p.subject_id))) return false;
          if (localFilter.levelIds?.length && (!p.level_id || !localFilter.levelIds.includes(p.level_id))) return false;
          return true;
        })
        .map((p) => {
          const eligible = p.answers.filter((a) => a.date <= asOf);
          if (eligible.length === 0) return null;
          const latest = eligible[eligible.length - 1];
          const statusName = latest.status ?? defaultStatus?.name ?? "";
          const statusRow = statusByName.get(statusName) ?? defaultStatus;
          const nextReview = computeNextReview(
            latest.date,
            statusRow?.stabilityDays ?? 0,
            p.standard_time,
            latest.duration_sec,
          );
          // daysUntil は asOf 基準 (= cursor 位置)
          const daysUntil = -computeDaysOverdue(nextReview, asOf);
          const history = eligible.map((a) => {
            const st = a.status ? statusByName.get(a.status) : null;
            return {
              date: a.date,
              color: st?.color ?? defaultStatus?.color ?? "#888",
              status: st?.name ?? defaultStatus?.name ?? "",
            };
          });
          return {
            problemId: p.id,
            code: p.code,
            name: p.name,
            fieldId: p.field_id,
            subjectId: p.subject_id || null,
            subjectName: p.subjectName ?? "",
            subjectColor: p.subjectColor ?? null,
            levelId: p.level_id || null,
            levelName: p.levelName ?? "",
            levelColor: p.levelColor ?? null,
            color: p.color ?? problemColor(p.code, p.name ?? "", p.subjectColor ?? null),
            lastStatus: statusRow?.name ?? "",
            statusColor: statusRow?.color ?? "#888",
            nextReview,
            daysUntil,
            reviewCount: eligible.length,
            standardTime: p.standard_time,
            lastDuration: latest.duration_sec ?? null,
            answerHistory: history,
          } satisfies ScheduleRow;
        })
        .filter((r): r is ScheduleRow => r !== null);
      return filtered;
    }
    // 通常: サーバ計算結果を使う
    const rows: ScheduleRow[] = (scheduleQuery.data ?? []).map((r) => ({
      problemId: r.problemId,
      code: r.code,
      name: r.name,
      fieldId: r.fieldId,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      subjectColor: r.subjectColor,
      levelId: r.levelId,
      levelName: r.levelName,
      levelColor: r.levelColor,
      color: r.color,
      lastStatus: r.lastStatus,
      statusColor: r.statusColor,
      nextReview: r.nextReview,
      daysUntil: r.daysUntil,
      reviewCount: r.answerCount,
      standardTime: r.standardTime,
      lastDuration: r.lastDuration,
      answerHistory: r.answerHistory,
    }));
    return applyMemberFilter(
      rows.map((r) => ({ subjectId: r.subjectId, levelId: r.levelId, _r: r })),
      localFilter,
    ).map(({ _r }) => _r);
  }, [scheduleQuery.data, localFilter, asOf, allProblems, statuses]);
  const loading = scheduleQuery.isLoading;

  // Client-side stability overrides (preview until saved via explicit button)
  const [stabilityOverrides, setStabilityOverrides] = useState<Map<string, number>>(new Map());
  const [showSlider, setShowSlider] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const updateStatus = useUpdateStatus();

  const saveOverrides = useCallback(async () => {
    if (stabilityOverrides.size === 0) return;
    setSavingOverrides(true);
    try {
      for (const [name, v] of stabilityOverrides) {
        const s = statuses.find((s) => s.name === name);
        if (!s) continue;
        if (s.stabilityDays === v) continue;
        await updateStatus.mutateAsync({
          id: s.id,
          payload: { stability_days: Math.max(0, Math.round(v)) },
        });
      }
      setStabilityOverrides(new Map());
      toast.success("復習間隔を保存しました");
    } catch (err) {
      toast.error(`保存に失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingOverrides(false);
    }
  }, [stabilityOverrides, statuses, updateStatus]);
  const sliderStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder),
    [statuses],
  );
  const sliderMax = useMemo(() => {
    const peak = Math.max(30, ...statuses.map((s) => s.stabilityDays));
    return Math.ceil((peak * 2) / 10) * 10;
  }, [statuses]);


  // UI state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "daysUntil", desc: false },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"waking" | "generating" | "downloading" | null>(null);

  // Filter state
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterLastStatuses, setFilterLastStatuses] = useState<Set<string>>(new Set());
  // DB 永続化
  const filterPrefsQuery = useFilterPrefs(scopeFieldId ?? undefined);
  const saveFilterPrefs = useSaveFilterPrefs(scopeFieldId ?? undefined);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scopeFieldId || prefsLoadedRef.current === scopeFieldId!) return;
    const data = filterPrefsQuery.data?.review;
    if (data) {
      setFilterSubjects(new Set(data.subjectIds ?? []));
      setFilterLevels(new Set(data.levelIds ?? []));
      setFilterLastStatuses(new Set(data.lastStatuses ?? []));
    }
    prefsLoadedRef.current = scopeFieldId!;
  }, [filterPrefsQuery.data, scopeFieldId]);
  // 変更時に save (debounce 不要、変化が低頻度)。
  // 直前の snapshot と一致するなら server と同期済み → 冗長な PUT を防ぐ。
  const lastSavedPrefsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scopeFieldId || prefsLoadedRef.current !== scopeFieldId!) return;
    const snapshot = JSON.stringify({
      s: [...filterSubjects].sort(),
      l: [...filterLevels].sort(),
      st: [...filterLastStatuses].sort(),
    });
    if (lastSavedPrefsRef.current === null) {
      // 初回 sync (load 直後): snapshot を記録するだけで PUT しない
      lastSavedPrefsRef.current = snapshot;
      return;
    }
    if (lastSavedPrefsRef.current === snapshot) return;
    lastSavedPrefsRef.current = snapshot;
    saveFilterPrefs.mutate({
      ...(filterPrefsQuery.data ?? {}),
      review: {
        subjectIds: [...filterSubjects],
        levelIds: [...filterLevels],
        lastStatuses: [...filterLastStatuses],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSubjects, filterLevels, filterLastStatuses]);

  const now = useMemo(() => new Date(), []);
  // today は asOf に追従 (drag/再生で動く)。
  const todayStr = useMemo(() => asOf ?? toJSTDateString(now), [now, asOf]);

  // Apply overrides by proportionally scaling each row's (nextReview - lastDate)
  // by sliderStab / baseStab. The C_T adjustment server applies divides out.
  const rows = useMemo<ScheduleRow[]>(() => {
    if (stabilityOverrides.size === 0) return serverRows;
    const baseStabByName = new Map(statuses.map((s) => [s.name, s.stabilityDays]));
    const todayMs = new Date(todayStr + "T00:00:00").getTime();
    return serverRows.map((r) => {
      const override = stabilityOverrides.get(r.lastStatus);
      if (override === undefined) return r;
      const baseStab = baseStabByName.get(r.lastStatus) ?? 0;
      if (override === baseStab) return r;
      const last = r.answerHistory.at(-1);
      if (!last) return r;
      const lastDate = last.date;
      let nextReview: string;
      if (override <= 0) {
        nextReview = lastDate;
      } else if (baseStab <= 0) {
        nextReview = addDays(lastDate, override);
      } else {
        const serverDays = Math.round(
          (new Date(r.nextReview + "T00:00:00").getTime() - new Date(lastDate + "T00:00:00").getTime()) /
            86_400_000,
        );
        const previewDays = Math.round((serverDays * override) / baseStab);
        nextReview = addDays(lastDate, previewDays);
      }
      const daysUntil = Math.round(
        (new Date(nextReview + "T00:00:00").getTime() - todayMs) / 86_400_000,
      );
      return { ...r, nextReview, daysUntil };
    });
  }, [serverRows, stabilityOverrides, statuses, todayStr]);

  const handleDataChanged = useCallback(() => {
    if (!scopeFieldId) return;
    qc.invalidateQueries({ queryKey: reviewKeys.list(scopeFieldId!) });
    qc.invalidateQueries({ queryKey: problemsKeys.list(scopeFieldId!) });
  }, [qc, scopeFieldId]);

  const { openDetail, renderDialogs } = useProblemDialogs({
    fieldId: scopeFieldId,
    allProblems,
    onDataChanged: handleDataChanged,
  });

  /* ── Filtered rows ── */

  const baseFilteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.reviewCount === 0) return false;  // 未回答問題はテーブル/チャート両方から除外
      if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
      if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
      if (filterLastStatuses.size > 0 && !filterLastStatuses.has(r.lastStatus)) return false;
      return true;
    });
  }, [rows, filterSubjects, filterLevels, filterLastStatuses]);

  const displayRows = baseFilteredRows;

  const chartRows = useMemo(
    () => baseFilteredRows.filter((r) => r.reviewCount > 0),
    [baseFilteredRows],
  );

  const toggleExportSelect = useCallback((problemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  }, []);

  const activeFilterCount = filterSubjects.size + filterLevels.size + filterLastStatuses.size;

  const selectAllVisible = useCallback(() => {
    const ids = new Set(displayRows.map((r) => r.problemId));
    setExportSelected(ids);
  }, [displayRows]);

  const selectedMinutes = useMemo(() => {
    if (exportSelected.size === 0) return 0;
    return Math.round(
      displayRows
        .filter((r) => exportSelected.has(r.problemId))
        .reduce((s, r) => s + (r.standardTime ?? 0), 0) / 60,
    );
  }, [exportSelected, displayRows]);

  const handleExport = useCallback(async () => {
    if (exportSelected.size === 0) return;
    setExporting(true);
    setExportPhase("waking");
    try {
      // Phase 1: ensure Render PDF service is warm (cold start can take 30-60s)
      const healthRes = await rpc.api.v1["pdf-export"].health.$get();
      if (!healthRes.ok) {
        const body = (await healthRes.json().catch(() => ({ error: healthRes.statusText }))) as { error?: string };
        throw new Error(body.error || "PDF service unhealthy");
      }

      // Phase 2: generate the PDF
      setExportPhase("generating");
      const res = await rpc.api.v1["pdf-export"].$post({
        json: { problem_ids: Array.from(exportSelected) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(body.error || "Export failed");
      }

      // Phase 3: download to browser
      setExportPhase("downloading");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-${todayStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDFエクスポート完了");
    } catch (err) {
      toast.error(`エクスポート失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
      setExportPhase(null);
    }
  }, [exportSelected, todayStr]);

  const handleSelect = useCallback((problemId: string) => {
    setSelectedId((prev) => (prev === problemId ? null : problemId));
    requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector(
        `[data-problem-id="${problemId}"]`,
      );
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const table = useReactTable({
    data: displayRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.lastStatus);
    return Array.from(set).sort((a, b) => (statusOrderMap.get(a) ?? 0) - (statusOrderMap.get(b) ?? 0));
  }, [rows, statusOrderMap]);

  // Dirty state for scope edit
  const scope = scopeQuery.data?.scope;
  // local 状態がまだサーバ値と同期していない (初回読み込み直後) は dirty=false で抑える
  // → ナビゲーション時に Save ボタンが一瞬光るのを防ぐ。
  const synced = !!scope && lastSyncRevRef.current === scope.revision;
  const filterDirty = synced && JSON.stringify(localFilter) !== JSON.stringify(scope!.filter ?? {});
  const nameDirty = synced && localName !== scope!.name;
  const scopeIdDirty = synced && localScopeId !== (scope!.scope_id ?? null);
  const dirty = filterDirty || nameDirty || scopeIdDirty;
  const membersOpen = membersEditorOpen || filterDirty;
  // history panel は明示的に ⋮ メニューで開いた時のみ。
  const historyOpen = historyPanelOpen;

  async function onConfirm() {
    if (!scope) return;
    await updateScope.mutateAsync({
      ...(nameDirty && { name: localName }),
      ...(filterDirty && { filter: localFilter }),
      ...(scopeIdDirty && { scope_id: localScopeId }),
    });
    lastSyncRevRef.current = null;
    toast.success("Saved");
  }

  async function onArchive() {
    if (!confirm("Archive this review scope? (History will be preserved)")) return;
    await archiveScope.mutateAsync(scopeId);
    navigate({ to: "/review" as string });
  }

  if (!scopeFieldId) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">
          Please select a project
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {renderHeaderSlot(
      <>
        <span className="text-xs font-medium truncate max-w-xs text-foreground/80">{localName}</span>
        {dirty && !readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button"
              onClick={() => {
                if (scope) {
                  setLocalName(scope.name);
                  setLocalFilter(scope.filter ?? {});
                  setLocalScopeId(scope.scope_id ?? null);
                }
              }}
              disabled={updateScope.isPending}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Discard changes"><RotateCcw className="size-3"/>Reset</button>
            <Button size="sm" onClick={onConfirm} disabled={updateScope.isPending}
              className="h-7 text-xs">
              {updateScope.isPending ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
              {updateScope.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        <Popover open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <PopoverTrigger asChild>
            <button type="button" title="More"
              aria-pressed={moreMenuOpen || membersOpen || historyOpen}
              className={`${dirty && !readOnly ? "" : "ml-auto"} inline-flex items-center justify-center size-7 rounded-md border transition-colors ${
                filterDirty || asOf != null
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
              active={historyOpen || asOf != null}
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
      </>
      )}

      {/* History panel */}
      {historyOpen && (
        <div className="rounded-md border px-3 py-2 text-xs space-y-2">
          <AsOfControls
            asOf={asOf}
            setAsOf={setAsOf}
            latest={toJSTDateString(now)}
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
              return (
                <button key={`${r.kind}-${r.entity_id}-${r.revision}`}
                  type="button"
                  onClick={() => setAsOf(isoDay)}
                  className={`w-full text-left flex items-baseline gap-2 px-2 py-1 rounded-sm transition-colors hover:bg-accent ${isActiveAsOf ? "bg-accent" : ""}`}>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-16 shrink-0">{tsLabel}</span>
                  <span className="text-[9px] uppercase font-semibold w-12 shrink-0 text-foreground/80">{r.kind}</span>
                  <span className="text-[10px] flex-1 truncate">{r.summary}</span>
                  <span className="text-[9px] text-muted-foreground">rev {r.revision}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Members filter editor */}
      {membersOpen && !readOnly && (
        <div className={`relative rounded-md border ${filterDirty ? "border-primary/40 bg-primary/5" : ""} px-3 py-2 text-xs space-y-2`}>
          <button type="button" onClick={() => setMembersEditorOpen(false)} disabled={filterDirty}
            title="Close"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">
            <X className="size-3.5"/>
          </button>
          <MemberFilterPicker
            fieldId={scopeFieldId!}
            value={localFilter}
            onChange={setLocalFilter}
            trailing={
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {filterDirty && (
                  <button type="button"
                    className="hover:text-foreground"
                    onClick={() => scope && setLocalFilter(scope.filter ?? {})}>
                    Reset
                  </button>
                )}
              </div>
            }
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <>
          {/* Schedule chart (常時 mount: rows=0 でも chart 構造は保持して didInit/scroll を残す) */}
          <div className="shrink-0 rounded-md border p-3">
            <div className="flex justify-between items-center gap-2 mb-1">
              <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-6 px-2 relative" title="Filter">
                    <Filter className="size-3" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-3 space-y-3" align="start">
                  {subjects.length > 0 && (
                    <FilterSection
                      label="Subject"
                      items={subjects.map((s) => ({ value: s.id, label: s.name }))}
                      selected={filterSubjects}
                      onChange={setFilterSubjects}
                    />
                  )}
                  {levels.length > 0 && (
                    <FilterSection
                      label="Level"
                      items={levels.map((l) => ({ value: l.id, label: l.name }))}
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
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                      onClick={() => { setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterLastStatuses(new Set()); }}
                    >
                      フィルター解除
                    </button>
                  )}
                </PopoverContent>
              </Popover>
              <BlockLegend entries={statuses.map<LegendEntry>((s) => ({
                kind: "fill", label: s.name, color: s.color ?? "#888",
                active: filterLastStatuses.has(s.name),
                onClick: () => setFilterLastStatuses((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.name)) next.delete(s.name); else next.add(s.name);
                  return next;
                }),
              }))}/>
              {exportSelected.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? (
                      <Loader2 className="size-3 mr-1 animate-spin" />
                    ) : (
                      <Download className="size-3 mr-1" />
                    )}
                    {exporting
                      ? exportPhase === "waking"
                        ? "Render 起床中..."
                        : exportPhase === "generating"
                          ? "PDF 処理中..."
                          : exportPhase === "downloading"
                            ? "ダウンロード中..."
                            : "エクスポート中..."
                      : `PDF (${exportSelected.size})`}
                  </Button>
                  {selectedMinutes > 0 && (
                    <div className="shrink-0 rounded-md border px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {selectedMinutes >= 60 && <>{Math.floor(selectedMinutes / 60)} H </>}
                      {selectedMinutes % 60 > 0 && <>{selectedMinutes % 60} min</>}
                    </div>
                  )}
                </>
              )}
              </div>
              <div className="flex items-center gap-2">
              {showSlider && stabilityOverrides.size > 0 && (
                <>
                  <button
                    type="button"
                    disabled={savingOverrides}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => setStabilityOverrides(new Map())}
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-[10px] px-2"
                    onClick={saveOverrides}
                    disabled={savingOverrides}
                  >
                    {savingOverrides ? (
                      <Loader2 className="size-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="size-3 mr-1" />
                    )}
                    {savingOverrides ? "保存中..." : "保存"}
                  </Button>
                </>
              )}
              {sliderStatuses.length > 0 && (
                <button
                  type="button"
                  title="復習間隔スライダー"
                  aria-pressed={showSlider}
                  className={`relative inline-flex items-center justify-center size-[22px] rounded-md border transition-colors ${
                    showSlider
                      ? "bg-accent text-accent-foreground border-accent-foreground/20"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => setShowSlider((p) => !p)}
                >
                  <SlidersHorizontal className="size-3" />
                  {stabilityOverrides.size > 0 && (
                    <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                  )}
                </button>
              )}
              </div>
            </div>
            {showSlider && sliderStatuses.length > 0 && (
              <div className="mb-2 px-2">
                <StabilitySlider
                  statuses={sliderStatuses}
                  overrides={stabilityOverrides}
                  max={sliderMax}
                  onChange={(name, v) =>
                    setStabilityOverrides((prev) => {
                      const next = new Map(prev);
                      next.set(name, Math.max(0, v));
                      return next;
                    })
                  }
                />
              </div>
            )}
            <ReviewChart items={chartRows} today={todayStr} realToday={toJSTDateString(now)} onSelect={handleSelect} onOpen={openDetail} selectedId={selectedId} colorMode="status" statusOrderMap={statusOrderMap}
              onTodayDrag={(d) => setAsOf(d === toJSTDateString(now) ? null : d)}/>
          </div>

          {/* Table (rows=0 なら非表示) */}
          {rows.length > 0 && (
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
                          checked={exportSelected.size > 0 && exportSelected.size === displayRows.length}
                          ref={(el) => { if (el) el.indeterminate = exportSelected.size > 0 && exportSelected.size < displayRows.length; }}
                          onChange={() => {
                            if (exportSelected.size > 0) setExportSelected(new Set());
                            else selectAllVisible();
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
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
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
                    <TableCell className="w-10 px-3 align-middle">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary cursor-pointer"
                          checked={exportSelected.has(pid)}
                          onClick={(e) => toggleExportSelect(pid, e)}
                          onChange={() => {}}
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
        </>
      )}

      {renderDialogs()}
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
