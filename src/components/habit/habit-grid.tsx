/**
 * HabitGrid: 1 habit = 1 row のヒートマップ表現。
 *
 * Tetris (= 識別不要な原子の集積) と違い、habit は個体識別が本質。
 * row 形式で各 habit の時系列をそのまま見せ、今日列を太線で強調する。
 */

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HabitRow } from "@/hooks/queries/use-habits";
import type { HabitCell } from "@/hooks/queries/use-habit-cells";
import type { HabitCandidate } from "@/hooks/queries/use-toggl-habit-candidates";
import { buildCandidateMap, displayFor } from "@/lib/habit-display";

const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;
const LABEL_W = 140;
const STREAK_W = 64;
const ROW_H = CELL + 6;

type Props = {
  habits: HabitRow[];
  cells: HabitCell[];
  candidates: HabitCandidate[];
  today: string;
  pastDays?: number;
  futureDays?: number;
  onEditHabit?: (id: string) => void;
  onAddHabit?: () => void;
};

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekBoundary(date: string): boolean {
  // 月曜日に M/D ラベルを置く (JST だが UTC date とずれない: YYYY-MM-DD は naive)
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

function monthDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** habit の cells から日付 → kind の lookup map を作る */
function indexCells(cells: HabitCell[]): Map<string, Map<string, HabitCell["kind"]>> {
  const byHabit = new Map<string, Map<string, HabitCell["kind"]>>();
  for (const c of cells) {
    let m = byHabit.get(c.habitId);
    if (!m) { m = new Map(); byHabit.set(c.habitId, m); }
    m.set(c.date, c.kind);
  }
  return byHabit;
}

/** 直近 7 日 (daily) or 4 週 (weekly) の done 率を分子/分母で返す。 */
function recentRatio(
  cellMap: Map<string, HabitCell["kind"]> | undefined,
  cadence: string,
  today: string,
): { hit: number; total: number } {
  if (!cellMap) return { hit: 0, total: cadence === "weekly" ? 4 : 7 };
  if (cadence === "weekly") {
    // 直近 28 日のうち throughput が立った日 = "週 1 達成" を 4 単位として数える
    let hit = 0;
    for (let i = 0; i < 28; i++) {
      const d = addDays(today, -i);
      if (cellMap.get(d) === "throughput") hit++;
    }
    return { hit: Math.min(4, hit), total: 4 };
  }
  let hit = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    if (cellMap.get(d) === "throughput") hit++;
  }
  return { hit, total: 7 };
}

export function HabitGrid({
  habits,
  cells,
  candidates,
  today,
  pastDays = 30,
  futureDays = 7,
  onEditHabit,
  onAddHabit,
}: Props) {
  const candidateMap = useMemo(() => buildCandidateMap(candidates), [candidates]);
  const cellMaps = useMemo(() => indexCells(cells), [cells]);

  const dates = useMemo(() => {
    const out: string[] = [];
    for (let i = pastDays; i >= 1; i--) out.push(addDays(today, -i));
    out.push(today);
    for (let i = 1; i <= futureDays; i++) out.push(addDays(today, i));
    return out;
  }, [today, pastDays, futureDays]);

  const todayIdx = pastDays;
  const totalCells = dates.length;
  const gridWidth = totalCells * STEP - GAP;

  const headerH = 18;
  const totalH = headerH + habits.length * ROW_H + 8;

  return (
    <div className="overflow-x-auto">
      <svg
        width={LABEL_W + gridWidth + STREAK_W + 16}
        height={totalH}
        className="block"
        style={{ minWidth: LABEL_W + gridWidth + STREAK_W + 16 }}
      >
        {/* ── Header: date labels at week boundaries + Today ── */}
        {dates.map((date, i) => {
          const x = LABEL_W + i * STEP;
          const showLabel = isWeekBoundary(date) || i === todayIdx;
          if (!showLabel) return null;
          return (
            <text
              key={`hdr-${date}`}
              x={x + CELL / 2}
              y={12}
              textAnchor="middle"
              className={i === todayIdx ? "fill-foreground font-medium" : "fill-muted-foreground"}
              fontSize={10}
            >
              {i === todayIdx ? "Today" : monthDay(date)}
            </text>
          );
        })}

        {/* ── Today column highlight (background) ── */}
        <rect
          x={LABEL_W + todayIdx * STEP - 1}
          y={headerH - 2}
          width={CELL + 2}
          height={habits.length * ROW_H + 4}
          fill="hsl(var(--accent))"
          opacity={0.25}
          rx={3}
        />

        {/* ── Rows ── */}
        {habits.map((h, rowIdx) => {
          const d = displayFor(h, candidateMap);
          const y = headerH + rowIdx * ROW_H;
          const cy = y + CELL / 2 + 2;
          const cellMap = cellMaps.get(h.id);
          const ratio = recentRatio(cellMap, h.cadence, today);

          return (
            <g key={h.id}>
              {/* habit label (clickable to edit) */}
              <g style={{ cursor: onEditHabit ? "pointer" : undefined }}
                 onClick={() => onEditHabit?.(h.id)}>
                <rect
                  x={0} y={y} width={LABEL_W - 4} height={ROW_H - 2}
                  fill="transparent"
                  className="hover:fill-accent/30"
                />
                <rect x={6} y={cy - 5} width={10} height={10} rx={2} fill={d.color} />
                <text x={22} y={cy + 4} className="fill-foreground" fontSize={12}>
                  {d.label}
                </text>
              </g>

              {/* cells */}
              {dates.map((date, i) => {
                const kind = cellMap?.get(date);
                const x = LABEL_W + i * STEP;
                const isToday = i === todayIdx;
                if (!kind) {
                  // 空セル: 薄い枠だけ (絶対 absent = サボった or n/a)
                  return (
                    <rect
                      key={`c-${h.id}-${date}`}
                      x={x} y={y + 2} width={CELL} height={CELL} rx={2}
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth={0.5}
                    />
                  );
                }
                if (kind === "throughput") {
                  // 過去 done / 今日 done: 塗り
                  return (
                    <rect
                      key={`c-${h.id}-${date}`}
                      x={x} y={y + 2} width={CELL} height={CELL} rx={2}
                      fill={d.color}
                      opacity={isToday ? 1 : 0.85}
                    />
                  );
                }
                if (kind === "next-step") {
                  // 今日の未消化: habit 色の太枠、塗りなし
                  return (
                    <rect
                      key={`c-${h.id}-${date}`}
                      x={x} y={y + 2} width={CELL} height={CELL} rx={2}
                      fill="none"
                      stroke={d.color}
                      strokeWidth={2}
                    />
                  );
                }
                // forecast (未来 slot): 細い破線枠
                return (
                  <rect
                    key={`c-${h.id}-${date}`}
                    x={x} y={y + 2} width={CELL} height={CELL} rx={2}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    opacity={0.5}
                  />
                );
              })}

              {/* streak / ratio */}
              <text
                x={LABEL_W + gridWidth + 12}
                y={cy + 4}
                className="fill-muted-foreground tabular-nums"
                fontSize={11}
              >
                {ratio.hit}/{ratio.total}
                <tspan className="fill-muted-foreground/60" fontSize={9} dx={3}>
                  {h.cadence === "weekly" ? "w" : "d"}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {/* + Add habit */}
      {habits.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-6">
          No habits yet. Click "Add habit" below to start.
        </div>
      )}
      <div className="pt-2 flex">
        <Button type="button" size="sm" variant="outline" onClick={onAddHabit} className="gap-1.5 ml-1">
          <Plus className="size-3.5" />
          Add habit
        </Button>
      </div>
    </div>
  );
}
