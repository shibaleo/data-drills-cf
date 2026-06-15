/**
 * HabitGrid: 1 habit = 1 row のヒートマップ表現 + 並べ替え。
 *
 * Tetris (= 識別不要な原子の集積) と違い、habit は個体識別が本質。
 * row 形式で各 habit の時系列をそのまま見せ、今日列を accent bg で強調する。
 * row は @dnd-kit/sortable で並べ替え可能 (drag handle に左端の grip icon)。
 */

import { useMemo } from "react";
import { Plus, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import type { HabitRow } from "@/hooks/queries/use-habits";
import type { HabitCell } from "@/hooks/queries/use-habit-cells";
import type { HabitCandidate } from "@/hooks/queries/use-toggl-habit-candidates";
import { buildCandidateMap, displayFor } from "@/lib/habit-display";
import { CELL, GAP, STEP } from "@/lib/chart-constants";

// row 高さ = STEP で TetrisChart の cell-to-cell 距離と完全一致
const ROW_H = STEP;
const CELL_OFFSET_Y = (ROW_H - CELL) / 2;  // = GAP / 2

type Props = {
  habits: HabitRow[];
  cells: HabitCell[];
  candidates: HabitCandidate[];
  today: string;
  pastDays?: number;
  futureDays?: number;
  onEditHabit?: (id: string) => void;
  onAddHabit?: () => void;
  onReorder?: (ids: string[]) => void;
};

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekBoundary(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

function monthDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function indexCells(cells: HabitCell[]): Map<string, Map<string, HabitCell["kind"]>> {
  const byHabit = new Map<string, Map<string, HabitCell["kind"]>>();
  for (const c of cells) {
    let m = byHabit.get(c.habitId);
    if (!m) { m = new Map(); byHabit.set(c.habitId, m); }
    m.set(c.date, c.kind);
  }
  return byHabit;
}

function recentRatio(
  cellMap: Map<string, HabitCell["kind"]> | undefined,
  cadence: string,
  today: string,
): { hit: number; total: number } {
  if (!cellMap) return { hit: 0, total: cadence === "weekly" ? 4 : 7 };
  if (cadence === "weekly") {
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
  onReorder,
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
  const gridWidth = dates.length * STEP - GAP;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!onReorder) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = habits.map((h) => h.id);
    const fromIdx = ids.indexOf(String(active.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    onReorder(arrayMove(ids, fromIdx, toIdx));
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: gridWidth + 200 }}>
        {/* ── Date header ── */}
        <DateHeader dates={dates} todayIdx={todayIdx} gridWidth={gridWidth} />

        {/* ── Sortable rows ── */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={habits.map((h) => h.id)}
            strategy={verticalListSortingStrategy}
          >
            {habits.map((h) => {
              const d = displayFor(h, candidateMap);
              const cellMap = cellMaps.get(h.id);
              const ratio = recentRatio(cellMap, h.cadence, today);
              return (
                <SortableHabitRow
                  key={h.id}
                  id={h.id}
                  label={d.label}
                  color={d.color}
                  cadence={h.cadence}
                  ratio={ratio}
                  dates={dates}
                  cellMap={cellMap}
                  todayIdx={todayIdx}
                  gridWidth={gridWidth}
                  onClickLabel={() => onEditHabit?.(h.id)}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        {habits.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-6">
            No habits yet. Click "Add habit" below to start.
          </div>
        )}

        <div className="pt-2 flex">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddHabit}
            className="gap-1.5 ml-1"
          >
            <Plus className="size-3.5" />
            Add habit
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Date header (HTML + svg overlay for today label) ─────────────── */

function DateHeader({
  dates,
  todayIdx,
  gridWidth,
}: {
  dates: string[];
  todayIdx: number;
  gridWidth: number;
}) {
  return (
    <div className="flex items-end h-[18px] mb-1">
      {/* sticky 左スペーサ: 横スクロール時に row 側 sticky label の真上を bg で覆う */}
      <div
        className="sticky left-0 z-10 bg-card h-full"
        style={{ width: HEADER_LEFT_PAD }}
      />
      <svg width={gridWidth} height={14} className="block">
        {dates.map((date, i) => {
          const x = i * STEP;
          const showLabel = isWeekBoundary(date) || i === todayIdx;
          if (!showLabel) return null;
          return (
            <text
              key={date}
              x={x + CELL / 2}
              y={11}
              textAnchor="middle"
              className={i === todayIdx ? "fill-foreground font-medium" : "fill-muted-foreground"}
              fontSize={10}
            >
              {i === todayIdx ? "Today" : monthDay(date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Sortable row ─────────────────────────────────────────────────── */

// sticky 左カラム幅の合計 (= grip 20 + gap 8 + color 12 + gap 8 + label 140 + pr-2 = 8) = 196px
// DateHeader の左スペーサと完全に揃え、date label と cell が縦に整列するようにする
const HEADER_LEFT_PAD = 20 + 8 + 12 + 8 + 140 + 8;

function SortableHabitRow({
  id,
  label,
  color,
  cadence,
  ratio,
  dates,
  cellMap,
  todayIdx,
  gridWidth,
  onClickLabel,
}: {
  id: string;
  label: string;
  color: string;
  cadence: string;
  ratio: { hit: number; total: number };
  dates: string[];
  cellMap: Map<string, HabitCell["kind"]> | undefined;
  todayIdx: number;
  gridWidth: number;
  onClickLabel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    height: ROW_H,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center group select-none"
    >
      {/* sticky 左カラム: 横スクロールしても label / handle が常に見える */}
      <div
        className="sticky left-0 z-10 flex items-center gap-2 bg-card pr-2"
        style={{ height: ROW_H }}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          className="size-5 -ml-0.5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="size-3.5" />
        </button>
        <span
          className="inline-block size-3 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <button
          type="button"
          onClick={onClickLabel}
          className="text-sm text-left hover:underline truncate"
          style={{ width: 140 }}
          title="Edit habit"
        >
          {label}
        </button>
      </div>

      <svg width={gridWidth} height={ROW_H} className="block shrink-0">
        {/* Today highlight (この row 分の bg) */}
        <rect
          x={todayIdx * STEP - GAP / 2}
          y={0}
          width={CELL + GAP}
          height={ROW_H}
          fill="hsl(var(--accent))"
          opacity={0.25}
        />
        {dates.map((date, i) => {
          const kind = cellMap?.get(date);
          const x = i * STEP;
          const isToday = i === todayIdx;
          if (!kind) {
            return (
              <rect
                key={date}
                x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2}
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth={0.5}
              />
            );
          }
          if (kind === "throughput") {
            return (
              <rect
                key={date}
                x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2}
                fill={color}
                opacity={isToday ? 1 : 0.85}
              />
            );
          }
          if (kind === "next-step") {
            return (
              <rect
                key={date}
                x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            );
          }
          // forecast
          return (
            <rect
              key={date}
              x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.5}
            />
          );
        })}
      </svg>

      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap pl-2">
        {ratio.hit}/{ratio.total}
        <span className="text-muted-foreground/60 ml-0.5 text-[10px]">
          {cadence === "weekly" ? "w" : "d"}
        </span>
      </span>
    </div>
  );
}
