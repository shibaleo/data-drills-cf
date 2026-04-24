"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Download, Filter, Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
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
import { usePageTitle } from "@/lib/page-context";
import { OpaqueTag } from "@/components/problem-card";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useScheduleList, scheduleKeys } from "@/hooks/queries/use-schedule";
import { useProblemsList, problemsKeys } from "@/hooks/queries/use-problems";
import { useUpdateStatus } from "@/hooks/queries/use-statuses";
import { SortHeader } from "@/app/(pages)/problems/columns";
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
import type { ScheduleRow as ScheduleApiRow } from "@/hooks/queries/use-schedule";

/* ── Row types ── */

/** Display row — adds reviewCount for the "next 4 weeks" forecast cell. */
interface ScheduleRow extends Omit<ScheduleApiRow, "answerCount"> {
  reviewCount: number;
  standardTime: number | null;
}

/* ── Schedule Chart (SVG) ── */

const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;

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

  const MIN_ROWS = 10;
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);
  const TOP_AXIS_H = 16;
  const BOTTOM_AXIS_H = 20;
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;
  const Y_AXIS_W = 28;

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
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.3}
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
                  opacity={0.06}
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
              {/* Top axis: relative days (every 7 days from today, plus today itself) */}
              {(() => {
                const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                if (diff % 7 !== 0) return null;
                const label = diff === 0 ? "今日" : diff > 0 ? `+${diff}` : `▲ ${Math.abs(diff)}`;
                return (
                  <text
                    x={x + CELL / 2}
                    y={10}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {label}
                  </text>
                );
              })()}
              {/* Bottom axis: absolute dates (same cadence) */}
              {(() => {
                const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                if (diff % 7 !== 0) return null;
                return (
                  <text
                    x={x + CELL / 2}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {`${new Date(date + "T12:00:00").getMonth() + 1} / ${new Date(date + "T12:00:00").getDate()}`}
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

  return (
    <div ref={trackRef} className="relative h-14 select-none touch-none">
      {/* Track line */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border rounded" />
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

/* ── Summary Card ── */

type SummaryFilter = "today" | "week";

function FilterSection({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (value: string, checked: boolean | "indeterminate") => {
    const next = new Set(selected);
    if (checked === true) next.add(value);
    else next.delete(value);
    onChange(next);
  };
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground mb-1">{label}</div>
      {items.map((item) => (
        <label
          key={item.value}
          className="flex items-center gap-2 px-1 py-1 text-xs rounded-sm hover:bg-accent cursor-pointer"
        >
          <Checkbox
            className="size-3.5"
            checked={selected.has(item.value)}
            onCheckedChange={(checked) => toggle(item.value, checked)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  active,
  onClick,
  variant,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant: "default" | "muted";
}) {
  const base = "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors select-none";
  const variants = {
    default: active
      ? "bg-foreground/10 border-foreground/30 text-foreground"
      : "hover:bg-foreground/5 text-foreground/70",
    muted: active
      ? "bg-accent border-accent-foreground/20 text-accent-foreground"
      : "hover:bg-muted text-muted-foreground",
  };
  return (
    <button type="button" className={`${base} ${variants[variant]}`} onClick={onClick}>
      <span>{label}</span>
      <span className="tabular-nums font-bold">{count}</span>
    </button>
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
          {d < 0 ? `▲ ${Math.abs(d)} d` : d === 0 ? "今日" : `${d} d`}
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
  usePageTitle("Schedule");
  const { currentProject, subjects, levels, statuses } = useProject();

  // Build status name → sortOrder map from DB statuses
  const statusOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of statuses) m.set(s.name, s.sortOrder);
    return m;
  }, [statuses]);

  const qc = useQueryClient();

  // Fast path: /schedule API (driven by TanStack Query)
  const scheduleQuery = useScheduleList(currentProject?.id);
  const serverRows = useMemo<ScheduleRow[]>(() => {
    return (scheduleQuery.data ?? []).map((r) => ({
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
  }, [scheduleQuery.data]);
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

  // Background: /problems-list for dialogs (shared with other pages)
  const dialogProblemsQuery = useProblemsList(currentProject?.id);
  const allProblems = dialogProblemsQuery.data ?? [];

  // UI state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "daysUntil", desc: false },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chartColorMode, setChartColorMode] = useState<ChartColorMode>("status");
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Filter state
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter | null>(null);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());

  const now = useMemo(() => new Date(), []);
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
    qc.invalidateQueries({ queryKey: scheduleKeys.list(currentProject.id) });
    qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
  }, [qc, currentProject]);

  const { openDetail, renderDialogs } = useProblemDialogs({
    allProblems,
    onDataChanged: handleDataChanged,
  });

  /* ── Filtered rows ── */

  const baseFilteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
      if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
      if (filterStatuses.size > 0 && !filterStatuses.has(r.lastStatus)) return false;
      return true;
    });
  }, [rows, filterSubjects, filterLevels, filterStatuses]);

  const summaryCounts = useMemo(() => {
    const todayRows = baseFilteredRows.filter((r) => r.daysUntil <= 0);
    const weekRows = baseFilteredRows.filter((r) => r.daysUntil > 0 && r.daysUntil <= 7);
    return {
      today: todayRows.length,
      week: weekRows.length,
    };
  }, [baseFilteredRows]);

  const displayRows = useMemo(() => {
    if (!summaryFilter) return baseFilteredRows;
    if (summaryFilter === "today") return baseFilteredRows.filter((r) => r.daysUntil <= 0);
    return baseFilteredRows.filter((r) => r.daysUntil > 0 && r.daysUntil <= 7);
  }, [baseFilteredRows, summaryFilter]);

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

  const activeFilterCount = filterSubjects.size + filterLevels.size + filterStatuses.size;

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
    try {
      const res = await rpc.api.v1["pdf-export"].$post({
        json: { problem_ids: Array.from(exportSelected) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(body.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exported-${todayStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDFエクスポート完了");
    } catch (err) {
      toast.error(`エクスポート失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
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
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      ) : (
        <>
          {/* Summary cards + Filters */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <SummaryCard
                label="今日"
                count={summaryCounts.today}

                active={summaryFilter === "today"}
                onClick={() => setSummaryFilter((p) => p === "today" ? null : "today")}
                variant="default"
              />
              <SummaryCard
                label="7日以内"
                count={summaryCounts.week}

                active={summaryFilter === "week"}
                onClick={() => setSummaryFilter((p) => p === "week" ? null : "week")}
                variant="muted"
              />

              <div className="h-4 w-px bg-border mx-1" />

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
                      selected={filterStatuses}
                      onChange={setFilterStatuses}
                    />
                  )}
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                      onClick={() => { setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterStatuses(new Set()); }}
                    >
                      フィルター解除
                    </button>
                  )}
                </PopoverContent>
              </Popover>

              {exportSelected.size > 0 && (
                <div className="h-4 w-px bg-border mx-1" />
              )}
              {exportSelected.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Download className="size-3 mr-1" />
                  )}
                  {exporting ? "エクスポート中..." : `PDF (${exportSelected.size})`}
                </Button>
              )}
            </div>

            {/* Selected time card (right side) */}
            {exportSelected.size > 0 && selectedMinutes > 0 && (
              <div className="shrink-0 rounded-md border px-3 py-1 text-center">
                <div className="text-lg font-semibold tabular-nums">
                  {selectedMinutes >= 60 && <>{Math.floor(selectedMinutes / 60)}<span className="text-xs font-normal text-muted-foreground ml-0.5 mr-1">H</span></>}
                  {selectedMinutes % 60 > 0 && <>{selectedMinutes % 60}<span className="text-xs font-normal text-muted-foreground ml-0.5">min</span></>}
                </div>
              </div>
            )}
          </div>

          {/* Schedule chart */}
          <div className="shrink-0 rounded-md border p-3">
            <div className="flex justify-end items-center gap-2 mb-1">
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
              <div className="inline-flex rounded-md border text-[10px]">
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded-l-md transition-colors ${chartColorMode === "problem" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setChartColorMode("problem")}
                >
                  Problem
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded-r-md transition-colors ${chartColorMode === "status" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setChartColorMode("status")}
                >
                  Status
                </button>
              </div>
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
            <ScheduleChart items={chartRows} today={todayStr} onSelect={handleSelect} onOpen={openDetail} selectedId={selectedId} colorMode={chartColorMode} statusOrderMap={statusOrderMap} />
          </div>

          {/* Table */}
          <div
            ref={tableRef}
            className="rounded-md border overflow-auto resize-y"
            style={{ height: "calc(10 * 2.25rem)", minHeight: "6rem", maxHeight: "80vh" }}
          >
            <Table className="table-fixed">
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    <TableHead className="sticky top-0 z-10 bg-background w-10 px-3">
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
                        className="sticky top-0 z-10 bg-background"
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
          </div>
        </>
      )}

      {renderDialogs()}
    </div>
  );
}
