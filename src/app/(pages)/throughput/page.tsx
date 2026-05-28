"use client";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useProject } from "@/hooks/use-project";
import { useThroughputList, type ThroughputRow } from "@/hooks/queries/use-throughput";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { blockColor, COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { formatRelDay } from "@/lib/relative-day";
import { usePageTitle } from "@/lib/page-context";
import { rpc } from "@/lib/rpc-client";
import { toast } from "sonner";
import { Filter, Download, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ResizableTableShell } from "@/components/resizable-table-shell";
import { OpaqueTag } from "@/components/problem-card";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";
import { FilterSection } from "@/components/filter-section";
import { useFilterPrefs, useSaveFilterPrefs } from "@/hooks/queries/use-filter-prefs";

import { CELL, STEP, Y_AXIS_W, MIN_ROWS } from "@/lib/chart-constants";

const TOP_AXIS_H = 16;
const BOTTOM_AXIS_H = 20;
const PAD_DAYS = 7;

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

export default function ThroughputPage() {
  usePageTitle("Throughput");
  const { currentProject, subjects, levels, statuses } = useProject();
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const { data: rows = [], isLoading } = useThroughputList(currentProject?.id);
  const allProblems = useProblemsList(currentProject?.id).data ?? [];
  const { openDetail, renderDialogs } = useProblemDialogs({ allProblems, onDataChanged: () => {} });
  const tableRef = useRef<HTMLDivElement>(null);

  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterPrevStatuses, setFilterPrevStatuses] = useState<Set<string>>(new Set());
  const [maxRowsCap, setMaxRowsCap] = useState<number | null>(10);  // null = auto
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"waking" | "generating" | "downloading" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter prefs persistence
  const filterPrefsQuery = useFilterPrefs(currentProject?.id);
  const saveFilterPrefs = useSaveFilterPrefs(currentProject?.id);
  const prefsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current === currentProject.id) return;
    if (filterPrefsQuery.data === undefined) return;
    const p = filterPrefsQuery.data?.throughput;
    if (p) {
      setFilterSubjects(new Set(p.subjectIds ?? []));
      setFilterLevels(new Set(p.levelIds ?? []));
      setFilterPrevStatuses(new Set(p.prevStatuses ?? []));
      if (p.maxRowsCap !== undefined) setMaxRowsCap(p.maxRowsCap);
    }
    prefsLoadedRef.current = currentProject.id;
  }, [currentProject, filterPrefsQuery.data]);
  useEffect(() => {
    if (!currentProject || prefsLoadedRef.current !== currentProject.id) return;
    saveFilterPrefs.mutate({
      ...(filterPrefsQuery.data ?? {}),
      throughput: {
        subjectIds: [...filterSubjects],
        levelIds: [...filterLevels],
        prevStatuses: [...filterPrevStatuses],
        maxRowsCap,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSubjects, filterLevels, filterPrevStatuses, maxRowsCap]);

  const filtered = useMemo<ThroughputRow[]>(() => rows.filter((r) => {
    if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
    if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
    if (filterPrevStatuses.size > 0) {
      const key = r.prevStatusName ?? "First";
      if (!filterPrevStatuses.has(key)) return false;
    }
    return true;
  }), [rows, filterSubjects, filterLevels, filterPrevStatuses]);

  const handleSelect = useCallback((problemId: string) => {
    setSelectedId((prev) => (prev === problemId ? null : problemId));
  }, []);
  const togglePrevStatus = useCallback((key: string) => {
    setFilterPrevStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { startDate, totalDays, columns, maxStack, renderCap, todayIdx } = useMemo(() => {
    const cols = new Map<string, ThroughputRow[]>();
    for (const r of filtered) {
      const arr = cols.get(r.date) ?? [];
      arr.push(r);
      cols.set(r.date, arr);
    }
    const earliest = filtered.length > 0 ? filtered[0].date : today;
    const latestData = filtered.length > 0 ? filtered[filtered.length - 1].date : today;
    const latest = latestData > today ? latestData : today;
    const start = addDays(earliest, -PAD_DAYS);
    const end = addDays(latest, PAD_DAYS);
    const days = diffDays(start, end) + 1;
    let max = 0;
    cols.forEach((v) => { if (v.length > max) max = v.length; });
    // Render cap = how many data blocks may stack per column.
    // Chart height always adds 2 rows of breathing space on top.
    const cap = maxRowsCap != null ? Math.min(max, maxRowsCap) : max;
    return {
      startDate: start,
      totalDays: days,
      columns: cols,
      renderCap: cap,
      maxStack: Math.max(MIN_ROWS, cap + 2),
      todayIdx: diffDays(start, today),
    };
  }, [filtered, today, maxRowsCap]);

  const chartWidth = totalDays * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 5; i <= maxStack; i += 5) ticks.push(i);
    return ticks;
  }, [maxStack]);

  // 初回マウント: 右端寄りにスクロール (= today を 1/3 位置に)
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayX = todayIdx * STEP;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, todayX - containerW / 3);
  }, [todayIdx]);

  const todayStr = today;
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
      a.download = `throughput-${todayStr}.pdf`;
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

  const uniqueFilteredProblemIds = useMemo(() => Array.from(new Set(filtered.map((r) => r.problemId))), [filtered]);
  const legendEntries: LegendEntry[] = useMemo(() => {
    const entries: LegendEntry[] = [{
      kind: "fill", label: "First", color: COLOR_FIRST_ATTEMPT,
      active: filterPrevStatuses.has("First"),
      onClick: () => togglePrevStatus("First"),
    }];
    for (const s of statuses) entries.push({
      kind: "fill", label: s.name, color: s.color ?? "#888",
      active: filterPrevStatuses.has(s.name),
      onClick: () => togglePrevStatus(s.name),
    });
    return entries;
  }, [statuses, filterPrevStatuses, togglePrevStatus]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  const activeFilterCount = filterSubjects.size + filterLevels.size + filterPrevStatuses.size;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
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
              {subjects.length > 0 && (
                <FilterSection label="Subject" items={subjects.map((s) => ({ value: s.id, label: s.name }))}
                  selected={filterSubjects} onChange={setFilterSubjects}/>
              )}
              {levels.length > 0 && (
                <FilterSection label="Level" items={levels.map((l) => ({ value: l.id, label: l.name }))}
                  selected={filterLevels} onChange={setFilterLevels}/>
              )}
              {activeFilterCount > 0 && (
                <button type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center pt-1"
                  onClick={() => { setFilterSubjects(new Set()); setFilterLevels(new Set()); setFilterPrevStatuses(new Set()); }}>
                  Clear all
                </button>
              )}
            </PopoverContent>
          </Popover>
          <BlockLegend entries={legendEntries}/>
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
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button"
              title="Row cap"
              className="inline-flex items-center justify-center size-[26px] rounded-md border text-muted-foreground hover:bg-muted transition-colors">
              <SlidersHorizontal className="size-3"/>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Max rows</span>
              <div className="inline-flex rounded-md border text-[10px] overflow-hidden">
                {([10, 20, null] as const).map((v) => (
                  <button key={String(v)}
                    type="button"
                    className={`px-2 py-0.5 transition-colors ${maxRowsCap === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setMaxRowsCap(v)}>
                    {v ?? "Auto"}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No data</div>
        ) : (
          <div className="flex">
            <svg width={Y_AXIS_W} height={chartHeight} className="block shrink-0">
              {yTicks.map((n) => (
                <text key={n} x={Y_AXIS_W - 4}
                  y={chartHeight - BOTTOM_AXIS_H - n * STEP + CELL / 2}
                  textAnchor="end" dominantBaseline="central"
                  className="fill-muted-foreground" fontSize={9}>
                  {n}
                </text>
              ))}
            </svg>
            <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
              <svg width={chartWidth} height={chartHeight} className="block">
                {/* Today vertical line */}
                {todayIdx >= 0 && todayIdx < totalDays && (
                  <line x1={todayIdx * STEP + CELL / 2} y1={TOP_AXIS_H}
                    x2={todayIdx * STEP + CELL / 2} y2={chartHeight - BOTTOM_AXIS_H}
                    stroke="hsl(var(--foreground))" strokeWidth={1.5}
                    strokeDasharray="4 3" opacity={0.7}/>
                )}
                {Array.from({ length: totalDays }, (_, colIdx) => {
                  const date = addDays(startDate, colIdx);
                  const x = colIdx * STEP;
                  const isToday = date === today;
                  const dayItems = columns.get(date) ?? [];
                  const diff = colIdx - todayIdx;
                  const showAxis = diff % 7 === 0;
                  return (
                    <g key={date}>
                      {isToday && (
                        <rect x={x - 1} y={TOP_AXIS_H} width={CELL + 2} height={maxStack * STEP}
                          fill="hsl(var(--foreground))" opacity={0.1}/>
                      )}
                      {/* Empty base blocks */}
                      {Array.from({ length: maxStack }, (_, i) => (
                        <rect key={i} x={x}
                          y={chartHeight - BOTTOM_AXIS_H - (i + 1) * STEP}
                          width={CELL} height={CELL} rx={2}
                          fill="none" stroke="hsl(var(--border))" strokeWidth={0.5}/>
                      ))}
                      {/* Filled blocks (capped at renderCap; chart leaves +2 rows of padding above) */}
                      {dayItems.slice(0, renderCap).map((r, stackIdx) => {
                        const by = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                        const color = blockColor({ side: "past", prevStatusColor: r.prevStatusColor });
                        return (
                          <rect key={r.id} x={x} y={by} width={CELL} height={CELL} rx={2}
                            fill={color} opacity={0.85}
                            className="cursor-pointer hover:opacity-100"
                            onClick={() => openDetail(r.problemId)}>
                            <title>{r.code}{r.name ? ` ${r.name}` : ""} — {date}</title>
                          </rect>
                        );
                      })}
                      {/* Overflow indicator if column was capped */}
                      {dayItems.length > renderCap && (
                        <text x={x + CELL / 2}
                          y={chartHeight - BOTTOM_AXIS_H - renderCap * STEP - 2}
                          textAnchor="middle" fontSize={8}
                          className="fill-muted-foreground" fontWeight={600}>
                          +{dayItems.length - renderCap}
                        </text>
                      )}
                      {/* Top axis: absolute dates */}
                      {showAxis && (
                        <text x={x + CELL / 2} y={10} textAnchor="middle"
                          className="fill-muted-foreground" fontSize={9}
                          fontWeight={isToday ? 700 : 400}>
                          {`${new Date(date + "T12:00:00").getMonth() + 1} / ${new Date(date + "T12:00:00").getDate()}`}
                        </text>
                      )}
                      {/* Bottom axis: relative days */}
                      {showAxis && (
                        <text x={x + CELL / 2} y={chartHeight - 4} textAnchor="middle"
                          className="fill-muted-foreground" fontSize={9}
                          fontWeight={isToday ? 700 : 400}>
                          {formatRelDay(diff)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

      </div>

      <ResizableTableShell ref={tableRef}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur w-10 px-3">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary cursor-pointer"
                    checked={exportSelected.size > 0 && exportSelected.size === uniqueFilteredProblemIds.length}
                    ref={(el) => { if (el) el.indeterminate = exportSelected.size > 0 && exportSelected.size < uniqueFilteredProblemIds.length; }}
                    onChange={() => {
                      if (exportSelected.size > 0) setExportSelected(new Set());
                      else setExportSelected(new Set(uniqueFilteredProblemIds));
                    }}
                  />
                </div>
              </TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 100 }}>Date</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}>Subject</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}>Level</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 64 }}>Code</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 240 }}>Name</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 70 }}>Duration</TableHead>
              <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur" style={{ width: 90 }}>Prev</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...filtered].reverse().map((r) => {
              const subj = r.subjectId ? subjectMap.get(r.subjectId) : null;
              const lv = r.levelId ? levelMap.get(r.levelId) : null;
              const mins = r.duration != null ? Math.round(r.duration / 60) : null;
              const prevName = r.prevStatusColor == null ? "First" : (r.prevStatusName ?? "Repeat");
              const prevColor = r.prevStatusColor ?? COLOR_FIRST_ATTEMPT;
              const sel = selectedId === r.problemId;
              return (
                <TableRow key={r.id} data-problem-id={r.problemId}
                  className={`cursor-pointer ${sel ? "bg-accent" : ""}`}
                  onClick={() => sel ? openDetail(r.problemId) : handleSelect(r.problemId)}
                  onDoubleClick={() => openDetail(r.problemId)}>
                  <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary cursor-pointer"
                        checked={exportSelected.has(r.problemId)}
                        onChange={() => {
                          setExportSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.problemId)) next.delete(r.problemId); else next.add(r.problemId);
                            return next;
                          });
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell style={{ width: 100 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{r.date}</span>
                  </TableCell>
                  <TableCell style={{ width: 70 }}>{subj ? <OpaqueTag name={subj.name} color={subj.color}/> : null}</TableCell>
                  <TableCell style={{ width: 70 }}>{lv ? <OpaqueTag name={lv.name} color={lv.color}/> : null}</TableCell>
                  <TableCell style={{ width: 64 }}><span className="font-mono text-xs">{r.code}</span></TableCell>
                  <TableCell style={{ width: 240 }}><span className="truncate block text-xs">{r.name ?? ""}</span></TableCell>
                  <TableCell style={{ width: 70 }}>
                    <span className="text-xs tabular-nums text-muted-foreground">{mins != null ? `${mins} 分` : ""}</span>
                  </TableCell>
                  <TableCell style={{ width: 90 }}>
                    <OpaqueTag name={prevName} color={prevColor}/>
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

