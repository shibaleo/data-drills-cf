/**
 * HabitGrid: 1 habit = 1 row のヒートマップ表現 + 並べ替え。
 *
 * Tetris (= 識別不要な原子の集積) と違い、habit は個体識別が本質。
 * row 形式で各 habit の時系列をそのまま見せ、今日列を accent bg で強調する。
 * row は @dnd-kit/sortable で並べ替え可能 (drag handle は hover で表示)。
 */

import { useMemo } from "react";
import { GripVertical } from "lucide-react";
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
import type { HabitRow } from "@/hooks/queries/use-habits";
import type { HabitCell } from "@/hooks/queries/use-habit-cells";
import { displayFor } from "@/lib/habit-display";
import { CELL, GAP, STEP } from "@/lib/chart-constants";

// row 高さ。横方向 STEP=16 (cell 14 + gap 2) より縦に余裕を持たせて密度を抑える。
const ROW_H = 22;
const CELL_OFFSET_Y = (ROW_H - CELL) / 2;

const HEADER_H = 28;

// sticky 左カラム幅 (= grip 20 + gap 8 + color 14 + gap 8 + label 140 + pr 8) = 198px
const HEADER_LEFT_PAD = 20 + 8 + 14 + 8 + 140 + 8;

// streak 列の固定幅
const STREAK_W = 64;

type Props = {
  habits: HabitRow[];
  cells: HabitCell[];
  colors: Record<string, string>;
  today: string;
  pastDays?: number;
  futureDays?: number;
  onEditHabit?: (id: string) => void;
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
  colors,
  today,
  pastDays = 30,
  futureDays = 7,
  onEditHabit,
  onReorder,
}: Props) {
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
      <div style={{ minWidth: gridWidth + HEADER_LEFT_PAD + STREAK_W }}>
        <DateHeader dates={dates} todayIdx={todayIdx} gridWidth={gridWidth} />

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
              const d = displayFor(h, colors);
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
          <div className="text-center text-sm text-muted-foreground py-8">
            No habits yet. Click "Add habit" above to start.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Date header ───────────────────────────────────────────────────── */

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
    <div className="flex items-stretch mb-2" style={{ height: HEADER_H }}>
      {/* sticky 左スペーサ */}
      <div
        className="sticky left-0 z-10 bg-card"
        style={{ width: HEADER_LEFT_PAD }}
      />
      <svg width={gridWidth} height={HEADER_H} className="block">
        {/* Today 列の連続ハイライト (header 全高を覆い、下の行と視覚的につながる) */}
        <rect
          x={todayIdx * STEP - GAP / 2}
          y={0}
          width={CELL + GAP}
          height={HEADER_H}
          fill="hsl(var(--accent))"
          opacity={0.3}
        />
        {dates.map((date, i) => {
          const x = i * STEP + CELL / 2;
          if (i === todayIdx) {
            return (
              <g key={date}>
                <text
                  x={x} y={11}
                  textAnchor="middle"
                  className="fill-foreground font-semibold"
                  fontSize={10}
                >
                  Today
                </text>
                <text
                  x={x} y={23}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={9}
                >
                  {monthDay(date)}
                </text>
              </g>
            );
          }
          if (isWeekBoundary(date)) {
            return (
              <text
                key={date}
                x={x} y={20}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {monthDay(date)}
              </text>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

/* ── Sortable row ─────────────────────────────────────────────────── */

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
      {/* sticky 左カラム */}
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
          className="inline-block size-3.5 rounded-[3px] shrink-0 ring-1 ring-inset ring-foreground/10"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <button
          type="button"
          onClick={onClickLabel}
          className="text-sm text-left text-foreground/90 hover:text-foreground hover:underline truncate"
          style={{ width: 140 }}
          title="Edit habit"
        >
          {label}
        </button>
      </div>

      <svg width={gridWidth} height={ROW_H} className="block shrink-0">
        {/* Today 列ハイライト */}
        <rect
          x={todayIdx * STEP - GAP / 2}
          y={0}
          width={CELL + GAP}
          height={ROW_H}
          fill="hsl(var(--accent))"
          opacity={0.3}
        />
        {dates.map((date, i) => {
          const kind = cellMap?.get(date);
          const x = i * STEP;
          const isToday = i === todayIdx;
          if (!kind) {
            // 空きセル: 薄い fill。方眼紙化を避けるため枠なし。
            return (
              <rect
                key={date}
                x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2.5}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.08}
              />
            );
          }
          if (kind === "throughput") {
            return (
              <rect
                key={date}
                x={x} y={CELL_OFFSET_Y} width={CELL} height={CELL} rx={2.5}
                fill={color}
                opacity={isToday ? 1 : 0.88}
              />
            );
          }
          if (kind === "next-step") {
            // 今日の未消化: habit 色の塗り + accent strong outline で目立たせる
            return (
              <rect
                key={date}
                x={x + 1} y={CELL_OFFSET_Y + 1} width={CELL - 2} height={CELL - 2} rx={2}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
            );
          }
          // forecast: ごく薄い点線 (情報密度を抑える)
          return (
            <rect
              key={date}
              x={x + 0.5} y={CELL_OFFSET_Y + 0.5} width={CELL - 1} height={CELL - 1} rx={2}
              fill="none"
              stroke={color}
              strokeWidth={0.75}
              strokeDasharray="1.5 2"
              opacity={0.45}
            />
          );
        })}
      </svg>

      {/* 直近率 */}
      <div
        className="flex items-baseline gap-0.5 pl-4 tabular-nums whitespace-nowrap"
        style={{ width: STREAK_W }}
      >
        <span className="text-foreground/90 text-xs font-medium">{ratio.hit}</span>
        <span className="text-muted-foreground/40 text-[10px]">/</span>
        <span className="text-muted-foreground text-[10px]">{ratio.total}</span>
        <span className="text-muted-foreground/50 text-[10px] ml-0.5">
          {cadence === "weekly" ? "w" : "d"}
        </span>
      </div>
    </div>
  );
}
