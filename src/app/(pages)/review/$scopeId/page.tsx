"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Download, Filter, Loader2, RotateCcw, Save, SlidersHorizontal, ArrowLeft, Archive, History, ListFilter, MoreVertical, Check, X } from "lucide-react";
import { useReviewScope, useReviewScopeRevisions, useUpdateReviewScope, useArchiveReviewScope } from "@/hooks/queries/use-review-scopes";
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
import { useProject } from "@/hooks/use-project";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";
import { usePageTitle } from "@/lib/page-context";
import { OpaqueTag } from "@/components/problem-card";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useReviewList, reviewKeys } from "@/hooks/queries/use-review";
import { useProblemsList, problemsKeys } from "@/hooks/queries/use-problems";
import { useUpdateStatus } from "@/hooks/queries/use-statuses";
import { SortHeader } from "@/components/sort-header";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";
import { FilterSection } from "@/components/filter-section";
import { CELL, STEP, Y_AXIS_W, MIN_ROWS } from "@/lib/chart-constants";
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

function ScheduleChart({
  items,
  today,
  onSelect,
  onOpen,
  selectedId,
  colorMode = "problem",
  statusOrderMap,
}: {
  items: ScheduleRow[];
  today: string;
  onSelect?: (problemId: string) => void;
  onOpen?: (problemId: string) => void;
  selectedId?: string | null;
  colorMode?: ChartColorMode;
  statusOrderMap: Map<string, number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const { dates, todayIdx } = useMemo(() => {
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
    return { dates: ds, todayIdx: ds.indexOf(today) };
  }, [items, today]);

  // Scroll to position today at ~1/3 from left
  useEffect(() => {
    if (!scrollRef.current || todayIdx < 0) return;
    const todayX = todayIdx * STEP;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = todayX - containerW / 3;
  }, [todayIdx]);

  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);
  const TOP_AXIS_H = 16;
  const BOTTOM_AXIS_H = 20;
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 5; i <= maxStack; i += 5) ticks.push(i);
    return ticks;
  }, [maxStack]);

  return (
    <div className="flex">
      <svg width={Y_AXIS_W} height={chartHeight} className="block shrink-0">
        {yTicks.map((n) => (
          <text
            key={n}
            x={Y_AXIS_W - 4}
            y={chartHeight - BOTTOM_AXIS_H - n * STEP + CELL / 2}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {n}
          </text>
        ))}
      </svg>
      <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
      <svg width={chartWidth} height={chartHeight} className="block">
        {/* Today vertical line */}
        {todayIdx >= 0 && (
          <line
            x1={todayIdx * STEP + CELL / 2}
            y1={TOP_AXIS_H}
            x2={todayIdx * STEP + CELL / 2}
            y2={chartHeight - BOTTOM_AXIS_H}
            stroke="hsl(var(--foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
          />
        )}
        {dates.map((date, colIdx) => {
          const dayItems = grouped.get(date) ?? [];
          const x = colIdx * STEP;
          const isToday = date === today;

          return (
            <g key={date}>
              {/* Today column highlight */}
              {isToday && (
                <rect
                  x={x - 1}
                  y={TOP_AXIS_H}
                  width={CELL + 2}
                  height={maxStack * STEP}
                  fill="hsl(var(--foreground))"
                  opacity={0.1}
                />
              )}
              {/* Empty background blocks */}
              {Array.from({ length: maxStack }, (_, i) => (
                <rect
                  key={`bg-${i}`}
                  x={x}
                  y={chartHeight - BOTTOM_AXIS_H - (i + 1) * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                />
              ))}
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
              {/* Top axis: absolute dates */}
              {(() => {
                const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
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
              {/* Bottom axis: relative days */}
              {(() => {
                const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
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
      </svg>
      </div>
    </div>
  );
}

/* ── Stability Slider (client-side preview) ── */

function StabilitySlider({
  statuses,
  overrides,
  onChange,
  max,
}: {
  statuses: { name: string; color: string | null; stabilityDays: number }[];
  overrides: Map<string, number>;
  onChange: (name: string, v: number) => void;
  max: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);

  const pctToVal = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * max);
    },
    [max],
  );

  const startDrag = (name: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = name;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(name, pctToVal(e.clientX));
  };

  const moveDrag = (name: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== name) return;
    onChange(name, pctToVal(e.clientX));
  };

  const endDrag = (name: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current === name) draggingRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  // 軸目盛 (max を 6 等分前後で切りのいい間隔に。30 日刻みで概ね収まる想定)
  const tickStep = max <= 30 ? 5 : max <= 90 ? 15 : max <= 200 ? 30 : 60;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += tickStep) ticks.push(v);

  return (
    <div ref={trackRef} className="relative h-14 select-none touch-none">
      {/* Track line */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border rounded" />
      {/* Axis ticks */}
      {ticks.map((v) => {
        const pct = (v / max) * 100;
        return (
          <div key={`tick-${v}`} className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pct}%` }}>
            <div className="w-px h-2 -mt-1 mx-auto bg-muted-foreground/40" />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
              {v}d
            </div>
          </div>
        );
      })}
      {/* Thumbs */}
      {statuses.map((s) => {
        const v = overrides.get(s.name) ?? s.stabilityDays;
        const pct = Math.min(100, Math.max(0, (v / max) * 100));
        const color = s.color ?? "#888";
        return (
          <div
            key={s.name}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full border-2 border-background cursor-grab active:cursor-grabbing"
            style={{ left: `${pct}%`, backgroundColor: color, boxShadow: "0 0 0 1px hsl(var(--border))" }}
            onPointerDown={startDrag(s.name)}
            onPointerMove={moveDrag(s.name)}
            onPointerUp={endDrag(s.name)}
            onPointerCancel={endDrag(s.name)}
          >
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] tabular-nums font-medium whitespace-nowrap"
              style={{ color }}
            >
              {v}d
            </div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
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
  const { scopeId } = useParams({ strict: false }) as { scopeId: string };
  const navigate = useNavigate();
  const { currentProject, subjects, levels, statuses } = useProject();

  const [asOf, setAsOf] = useState<string | null>(null);
  const readOnly = asOf != null;
  // 注: asOf はチャート側の client-side フィルタ専用にし、エンティティ取得は常に最新を引く。
  const scopeQuery = useReviewScope(scopeId);
  const revisionsQuery = useReviewScopeRevisions(scopeId);
  const updateScope = useUpdateReviewScope(scopeId, currentProject?.id);
  const archiveScope = useArchiveReviewScope(currentProject?.id);

  // Local editable state (backlog ミラー)
  const [localName, setLocalName] = useState("");
  const [localFilter, setLocalFilter] = useState<MemberFilterInput>({});
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
  }, [scopeQuery.data]);

  // Build status name → sortOrder map from DB statuses
  const statusOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of statuses) m.set(s.name, s.sortOrder);
    return m;
  }, [statuses]);

  const qc = useQueryClient();

  // /problems-list — full problem + answer data (for client-side asOf recomputation)
  const dialogProblemsQuery = useProblemsList(currentProject?.id);
  const allProblems = dialogProblemsQuery.data ?? [];

  // Fast path: /api/v1/review (driven by TanStack Query)
  // 注: asOf を渡さない。asOf 適用はクライアント計算で行い、アニメーション再生時の
  // サーバ往復を回避する。
  const scheduleQuery = useReviewList(currentProject?.id);
  const serverRows = useMemo<ScheduleRow[]>(() => {
    // asOf 指定中: クライアントで全 problems + answers から再計算する。
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
          // daysUntil は現実の今日基準 (再生中も "今日まであと何日" は変わらない)
          const daysUntil = -computeDaysOverdue(nextReview, toJSTDateString(new Date()));
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
  const filterPrefsQuery = useFilterPrefs(currentProject?.id);
  const saveFilterPrefs = useSaveFilterPrefs(currentProject?.id);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current === currentProject.id) return;
    const data = filterPrefsQuery.data?.review;
    if (data) {
      setFilterSubjects(new Set(data.subjectIds ?? []));
      setFilterLevels(new Set(data.levelIds ?? []));
      setFilterLastStatuses(new Set(data.lastStatuses ?? []));
    }
    prefsLoadedRef.current = currentProject.id;
  }, [filterPrefsQuery.data, currentProject]);
  // 変更時に save (debounce 不要、変化が低頻度)
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current !== currentProject.id) return;
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
  // today は常に現実の今日。asOf は answer の cutoff にだけ使う (chart の今日線・daysUntil は維持)。
  const todayStr = useMemo(() => toJSTDateString(now), [now]);

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
    if (!currentProject) return;
    qc.invalidateQueries({ queryKey: reviewKeys.list(currentProject.id) });
    qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
  }, [qc, currentProject]);

  const { openDetail, renderDialogs } = useProblemDialogs({
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
  const dirty = filterDirty || nameDirty;
  const membersOpen = membersEditorOpen || filterDirty;
  const historyOpen = historyPanelOpen || readOnly;

  async function onConfirm() {
    if (!scope) return;
    await updateScope.mutateAsync({
      ...(nameDirty && { name: localName }),
      ...(filterDirty && { filter: localFilter }),
    });
    lastSyncRevRef.current = null;
    toast.success("Saved");
  }

  async function onArchive() {
    if (!confirm("Archive this review scope? (History will be preserved)")) return;
    await archiveScope.mutateAsync(scopeId);
    navigate({ to: "/review" as string });
  }

  if (!currentProject) {
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
      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate({ to: "/review" as string })}
          className="text-muted-foreground hover:text-foreground transition-colors" title="Back to list">
          <ArrowLeft className="size-4"/>
        </button>
        <Input value={localName} onChange={(e) => setLocalName(e.target.value)} disabled={readOnly}
          className="h-7 text-xs max-w-xs"/>
        {dirty && !readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button"
              onClick={() => {
                if (scope) {
                  setLocalName(scope.name);
                  setLocalFilter(scope.filter ?? {});
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
            projectId={currentProject.id}
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
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      ) : (
        <>
          {/* Schedule chart */}
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
            <ScheduleChart items={chartRows} today={todayStr} onSelect={handleSelect} onOpen={openDetail} selectedId={selectedId} colorMode="status" statusOrderMap={statusOrderMap} />
          </div>

          {/* Table */}
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
