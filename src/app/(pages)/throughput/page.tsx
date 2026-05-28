"use client";
import { useMemo, useRef, useEffect, useState } from "react";
import { useProject } from "@/hooks/use-project";
import { useThroughputList, type ThroughputRow } from "@/hooks/queries/use-throughput";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { blockColor, COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;
const AXIS_H = 28;

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

export default function ThroughputPage() {
  const { currentProject, subjects, levels } = useProject();
  const { data: rows = [], isLoading } = useThroughputList(currentProject?.id);
  const allProblems = useProblemsList(currentProject?.id).data ?? [];
  const { openDetail, renderDialogs } = useProblemDialogs({ allProblems, onDataChanged: () => {} });

  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo<ThroughputRow[]>(() => rows.filter((r) => {
    if (filterSubjects.size > 0 && (!r.subjectId || !filterSubjects.has(r.subjectId))) return false;
    if (filterLevels.size > 0 && (!r.levelId || !filterLevels.has(r.levelId))) return false;
    return true;
  }), [rows, filterSubjects, filterLevels]);

  const { startDate, endDate, columns, maxStack } = useMemo(() => {
    if (filtered.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { startDate: today, endDate: today, columns: new Map<string, ThroughputRow[]>(), maxStack: 0 };
    }
    const start = filtered[0].date;
    const today = new Date().toISOString().slice(0, 10);
    const end = today >= filtered[filtered.length - 1].date ? today : filtered[filtered.length - 1].date;
    const cols = new Map<string, ThroughputRow[]>();
    for (const r of filtered) {
      const arr = cols.get(r.date) ?? [];
      arr.push(r);
      cols.set(r.date, arr);
    }
    let max = 0;
    cols.forEach((v) => { if (v.length > max) max = v.length; });
    return { startDate: start, endDate: end, columns: cols, maxStack: max };
  }, [filtered]);

  const totalDays = Math.max(1, diffDays(startDate, endDate) + 1);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayX = diffDays(startDate, today) * STEP;
  const svgWidth = totalDays * STEP;
  const svgHeight = maxStack * STEP + AXIS_H + 4;

  // 月境界マーカー (= 1日)
  const monthMarks = useMemo(() => {
    const marks: { x: number; label: string }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      if (d.endsWith("-01")) {
        marks.push({ x: i * STEP, label: d.slice(0, 7) });
      }
    }
    return marks;
  }, [startDate, totalDays]);

  // 初回マウント: 右端 (= today) にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [svgWidth]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  const activeFilterCount = filterSubjects.size + filterLevels.size;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Throughput</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {rows.length} answers · {filtered.length} shown
        </span>
      </div>

      <div className="rounded-md border p-3 space-y-2">
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
                  onClick={() => { setFilterSubjects(new Set()); setFilterLevels(new Set()); }}>
                  Clear all
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No answers yet</div>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto pb-2">
            <svg width={svgWidth} height={svgHeight} className="block">
              {/* 月境界 */}
              {monthMarks.map((m) => (
                <g key={m.x}>
                  <line x1={m.x} y1={0} x2={m.x} y2={svgHeight - AXIS_H} stroke="currentColor" strokeOpacity={0.08}/>
                  <text x={m.x + 2} y={svgHeight - 14} fontSize={10} className="fill-muted-foreground">{m.label}</text>
                </g>
              ))}
              {/* 今日の縦線 */}
              <line x1={todayX} y1={0} x2={todayX} y2={svgHeight - AXIS_H}
                stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 2"/>
              <text x={todayX + 2} y={10} fontSize={10} className="fill-foreground">today</text>

              {/* ブロック */}
              {[...columns.entries()].map(([date, list]) => {
                const colX = diffDays(startDate, date) * STEP;
                return list.map((r, i) => {
                  const y = svgHeight - AXIS_H - 4 - (i + 1) * STEP;
                  const color = blockColor({ side: "past", prevStatusColor: r.prevStatusColor });
                  return (
                    <rect key={r.id} x={colX} y={y} width={CELL} height={CELL} rx={2}
                      fill={color} className="cursor-pointer hover:opacity-70"
                      onClick={() => openDetail(r.problemId)}>
                      <title>{r.code}{r.name ? ` ${r.name}` : ""} — {date}</title>
                    </rect>
                  );
                });
              })}
            </svg>
          </div>
        )}

        <Legend/>
      </div>

      {renderDialogs()}
    </div>
  );
}

function Legend() {
  const pill = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground";
  const dot = (color: string) => <span className="size-2 rounded-sm" style={{ background: color }}/>;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={pill}>{dot(COLOR_FIRST_ATTEMPT)}First attempt</span>
      <span className={pill}>
        <span className="size-2 rounded-sm" style={{ background: "linear-gradient(45deg,#888,#aaa)" }}/>
        Repeat (= previous status color)
      </span>
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
