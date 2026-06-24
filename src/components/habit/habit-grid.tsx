/**
 * HabitGrid: 1 habit = 1 row のヒートマップ表現 + 並べ替え。
 *
 * Tetris (= 識別不要な原子の集積) と違い、habit は個体識別が本質。
 * row 形式で各 habit の時系列をそのまま見せ、今日列を accent bg で強調する。
 * row は @dnd-kit/sortable で並べ替え可能 (drag handle は hover で表示)。
 */

import { useMemo } from "react";
import { GripVertical, GripHorizontal } from "lucide-react";
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
import type { HabitCategoryRow } from "@/hooks/queries/use-habit-categories";
import type { HabitCell } from "@/hooks/queries/use-habit-cells";
import { displayFor } from "@/lib/habit-display";
import { CELL, GAP, STEP } from "@/lib/chart-constants";

// row 高さ。横方向 STEP=16 (cell 14 + gap 2) より縦に余裕を持たせて密度を抑える。
const ROW_H = 22;
const CELL_OFFSET_Y = (ROW_H - CELL) / 2;

const HEADER_H = 28;

// sticky 左カラム幅 (= grip 20 + gap 8 + color 14 + gap 8 + label 100 + pr 8) = 158px
const HEADER_LEFT_PAD = 20 + 8 + 14 + 8 + 100 + 8;
const LABEL_WIDTH = 100;

// streak 列の固定幅
const STREAK_W = 64;

type Props = {
  habits: HabitRow[];
  categories: HabitCategoryRow[];
  cells: HabitCell[];
  colors: Record<string, string>;
  today: string;
  pastDays?: number;
  futureDays?: number;
  onEditHabit?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  onReorderCategories?: (ids: string[]) => void;
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

type Group = {
  categoryId: string | null;
  label: string;          // category.name or "Other"
  isOther: boolean;
  catSort: number;        // master sort_order (Other は +Infinity)
  habits: HabitRow[];
};

/** habits を cadence でまず分け、各 cadence 内で category 別 group にする。
 *  group は master の sort_order 昇順、Other は末尾。 */
function partition(
  habits: HabitRow[],
  categories: HabitCategoryRow[],
): { cadence: "daily" | "weekly"; groups: Group[] }[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: { cadence: "daily" | "weekly"; groups: Group[] }[] = [];
  for (const cad of ["daily", "weekly"] as const) {
    const inCad = habits.filter((h) => h.cadence === cad);
    if (inCad.length === 0) continue;
    const byCat = new Map<string, HabitRow[]>();  // key: categoryId or "" for null
    for (const h of inCad) {
      const key = h.categoryId ?? "";
      let bucket = byCat.get(key);
      if (!bucket) { bucket = []; byCat.set(key, bucket); }
      bucket.push(h);
    }
    const groups: Group[] = [];
    for (const [key, hs] of byCat) {
      hs.sort((a, b) => a.sortOrder - b.sortOrder);
      const cat = key === "" ? null : catById.get(key);
      groups.push({
        categoryId: key === "" ? null : key,
        label: cat ? cat.name : "Other",
        isOther: key === "" || !cat,
        catSort: cat ? cat.sortOrder : Number.POSITIVE_INFINITY,
        habits: hs,
      });
    }
    groups.sort((a, b) => {
      if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
      return a.catSort - b.catSort;
    });
    out.push({ cadence: cad, groups });
  }
  return out;
}

export function HabitGrid({
  habits,
  categories,
  cells,
  colors,
  today,
  pastDays = 30,
  futureDays = 7,
  onEditHabit,
  onReorder,
  onReorderCategories,
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

  const sections = useMemo(() => partition(habits, categories), [habits, categories]);

  // SortableContext の items prop は参照が変わると dnd-kit が drag transition を見失うため memo 必須。
  // habit 順序 = sections の習慣を flatten した順 (= 表示順)。
  const habitIds = useMemo(
    () => sections.flatMap((s) => s.groups.flatMap((g) => g.habits.map((h) => h.id))),
    [sections],
  );
  // cadence section ごとに、その中で並び替え可能な category id 群。
  const categoryIdsPerCadence = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const sec of sections) {
      m.set(sec.cadence, sec.groups
        .filter((g) => g.categoryId)
        .map((g) => `cat:${sec.cadence}:${g.categoryId}`));
    }
    return m;
  }, [sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Category header drag (ID は "cat:<cadence>:<categoryId>" prefix)
    if (activeId.startsWith("cat:")) {
      if (!onReorderCategories) return;
      const cad = activeId.split(":")[1];
      const activeCatId = activeId.split(":")[2];
      const overCatId = overId.startsWith("cat:") ? overId.split(":")[2] : null;
      if (!overCatId) return;
      const sec = sections.find((s) => s.cadence === cad);
      if (!sec) return;
      const visible = sec.groups.filter((g) => g.categoryId).map((g) => g.categoryId as string);
      const fromIdx = visible.indexOf(activeCatId);
      const toIdx = visible.indexOf(overCatId);
      if (fromIdx < 0 || toIdx < 0) return;
      const newVisible = arrayMove(visible, fromIdx, toIdx);
      // master order に interleave (見える category だけ並び替え、他は据え置き)
      const allOrder = categories.map((c) => c.id);
      const visibleSet = new Set(visible);
      let vi = 0;
      const newGlobal = allOrder.map((id) => (visibleSet.has(id) ? newVisible[vi++] : id));
      onReorderCategories(newGlobal);
      return;
    }

    // Habit row drag
    if (!onReorder) return;
    const flatIds: string[] = [];
    for (const sec of sections) for (const g of sec.groups) for (const h of g.habits) flatIds.push(h.id);
    const fromIdx = flatIds.indexOf(activeId);
    const toIdx = flatIds.indexOf(overId);
    if (fromIdx < 0 || toIdx < 0) return;
    onReorder(arrayMove(flatIds, fromIdx, toIdx));
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
            items={habitIds}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((sec) => (
              <div key={sec.cadence} className="mb-3">
                {sections.length > 1 && (
                  <CadenceSection label={sec.cadence === "daily" ? "Daily" : "Weekly"} />
                )}
                <SortableContext
                  items={categoryIdsPerCadence.get(sec.cadence) ?? []}
                  strategy={verticalListSortingStrategy}
                >
                  {sec.groups.map((g) => {
                    const agg = aggregateRatio(g.habits, cellMaps, sec.cadence, today);
                    return (
                      <div key={`${sec.cadence}|${g.categoryId ?? "_other"}`} className="mb-1">
                        {g.categoryId ? (
                          <SortableCategoryHeader
                            id={`cat:${sec.cadence}:${g.categoryId}`}
                            label={g.label}
                            hit={agg.hit}
                            total={agg.total}
                            cadence={sec.cadence}
                            gridWidth={gridWidth}
                          />
                        ) : (
                          <CategoryHeader
                            label={g.label}
                            hit={agg.hit}
                            total={agg.total}
                            cadence={sec.cadence}
                            gridWidth={gridWidth}
                          />
                        )}
                        {g.habits.map((h) => {
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
                    </div>
                  );
                  })}
                </SortableContext>
              </div>
            ))}
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

function aggregateRatio(
  habits: HabitRow[],
  cellMaps: Map<string, Map<string, HabitCell["kind"]>>,
  cadence: "daily" | "weekly",
  today: string,
): { hit: number; total: number } {
  let hit = 0, total = 0;
  for (const h of habits) {
    const r = recentRatio(cellMaps.get(h.id), cadence, today);
    hit += r.hit; total += r.total;
  }
  return { hit, total };
}

function CadenceSection({ label }: { label: string }) {
  return (
    <div className="sticky left-0 z-20 bg-card px-1 py-1 mt-2 first:mt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function CategoryHeaderInner({
  label,
  hit,
  total,
  cadence,
  gridWidth,
  dragHandle,
}: {
  label: string;
  hit: number;
  total: number;
  cadence: "daily" | "weekly";
  gridWidth: number;
  dragHandle?: React.ReactNode;
}) {
  return (
    <div className="flex items-center text-xs text-muted-foreground group" style={{ height: 22 }}>
      <div
        className="sticky left-0 z-10 pr-2 flex items-center gap-1"
        style={{ width: HEADER_LEFT_PAD }}
      >
        {dragHandle ?? <span className="size-5 -ml-0.5" aria-hidden />}
        <span className="pl-1 truncate font-medium text-foreground/70">{label}</span>
      </div>
      <div style={{ width: gridWidth }} />
      <div
        className="flex items-baseline gap-0.5 pl-4 tabular-nums whitespace-nowrap"
        style={{ width: STREAK_W }}
      >
        <span className="text-foreground/80 text-xs font-medium">{hit}</span>
        <span className="text-muted-foreground/40 text-[10px]">/</span>
        <span className="text-muted-foreground text-[10px]">{total}</span>
        <span className="text-muted-foreground/50 text-[10px] ml-0.5">
          {cadence === "weekly" ? "w" : "d"}
        </span>
      </div>
    </div>
  );
}

function CategoryHeader(props: {
  label: string;
  hit: number;
  total: number;
  cadence: "daily" | "weekly";
  gridWidth: number;
}) {
  return <CategoryHeaderInner {...props} />;
}

function SortableCategoryHeader({
  id,
  ...rest
}: {
  id: string;
  label: string;
  hit: number;
  total: number;
  cadence: "daily" | "weekly";
  gridWidth: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <CategoryHeaderInner
        {...rest}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            title="Drag to reorder category"
            className="size-5 -ml-0.5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripHorizontal className="size-3.5" />
          </button>
        }
      />
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
          style={{ width: LABEL_WIDTH }}
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
