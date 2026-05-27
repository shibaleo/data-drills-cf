/**
 * Plan 用 Tetris チャート。
 * layers (= 横トラックの一覧) と milestones (= 各 layer 上の pin) を別エンティティとして受け取る。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Hash, CalendarDays, Trash2, Eye, EyeOff, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AllocatedProblem, Milestone } from "@/lib/plan-allocate";

export type PlanChartHandle = {
  getCenterDate(): string;
};

export type LayerView = {
  id: string;
  name: string;
};
export type MilestoneView = {
  id: string;
  layer_id: string;
  target: number;
  date: string;
};

type PlanChartProps = {
  items: AllocatedProblem[];
  layers: LayerView[];
  milestones: MilestoneView[];
  today: string;
  selectedId?: string | null;
  onSelect?: (problemId: string) => void;
  onOpen?: (problemId: string) => void;
  /** ピンドラッグ中 (= live preview)。連続的に発火するので API mutation には使わない。 */
  onMilestoneDateDraft?: (id: string, newDate: string) => void;
  /** ピンドラッグ完了 / メニューでの日付変更 (= 確定)。API mutation はこっち。 */
  onMilestoneDateChange?: (id: string, newDate: string) => void;
  onMilestoneTargetChange?: (id: string, newTarget: number) => void;
  onMilestoneRemove?: (id: string) => void;
  /** 各 layer に milestone 追加 */
  onMilestoneAddToLayer?: (layerId: string) => void;
  /** 各 layer の名前変更 */
  onLayerNameChange?: (id: string, newName: string) => void;
  /** layer 削除 */
  onLayerRemove?: (id: string) => void;
  /** layer 追加 */
  onAddLayer?: () => void;
  /** layer 並び替え (= 並び替え後の id 配列を渡す) */
  onReorderLayers?: (orderedLayerIds: string[]) => void;
  showMilestonePins?: boolean;
  /** 各 milestone の「実際に N 問目に相当する problem」をハイライトするためのアンカー */
  milestoneAnchors?: { target: number; problemId: string | null }[];
};

const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;

const COLOR_PAST = "#22c55e";
const COLOR_FUTURE = "#3b82f6";
const COLOR_OVERFLOW = "#ef4444";
const MS_COLOR = "#f59e0b";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const PlanChart = forwardRef<PlanChartHandle, PlanChartProps>(function PlanChartImpl({
  items,
  layers,
  milestones,
  today,
  selectedId,
  onSelect,
  onOpen,
  onMilestoneDateDraft,
  onMilestoneDateChange,
  onMilestoneTargetChange,
  onMilestoneRemove,
  onMilestoneAddToLayer,
  onLayerNameChange,
  onLayerRemove,
  onAddLayer,
  onReorderLayers,
  showMilestonePins,
  milestoneAnchors,
}: PlanChartProps, ref) {
  const _showPins = showMilestonePins ?? true;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const t = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function toggleLayerHidden(layerId: string) {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }
  const isLayerHidden = (layerId: string) => hiddenLayers.has(layerId);

  const grouped = useMemo(() => {
    const map = new Map<string, AllocatedProblem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    const sideOrder = { past: 0, future: 1 } as const;
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.overflow !== b.overflow) return a.overflow ? 1 : -1;
        return sideOrder[a.side] - sideOrder[b.side];
      });
    }
    return map;
  }, [items]);

  const { dates, todayIdx } = useMemo(() => {
    const allDates = [today, ...items.map((i) => i.date), ...milestones.map((m) => m.date)];
    const minDate = allDates.reduce((a, b) => (a < b ? a : b), today);
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b), today);
    const rangeStart = addDays(minDate < today ? minDate : today, -7);
    const rangeEnd = addDays(maxDate > today ? maxDate : today, 14);
    const ds: string[] = [];
    let d = rangeStart;
    while (d <= rangeEnd) { ds.push(d); d = addDays(d, 1); }
    return { dates: ds, todayIdx: ds.indexOf(today) };
  }, [items, milestones, today]);

  const didInitScroll = useRef(false);
  useEffect(() => {
    if (!scrollRef.current || todayIdx < 0 || didInitScroll.current) return;
    didInitScroll.current = true;
    const todayX = todayIdx * STEP;
    scrollRef.current.scrollLeft = todayX - scrollRef.current.clientWidth / 3;
  }, [todayIdx]);

  useImperativeHandle(ref, () => ({
    getCenterDate() {
      const container = scrollRef.current;
      if (!container || dates.length === 0) return today;
      const centerX = container.scrollLeft + container.clientWidth / 2;
      const colIdx = Math.max(0, Math.min(dates.length - 1, Math.round(centerX / STEP)));
      return dates[colIdx];
    },
  }), [dates, today]);

  const MIN_ROWS = 10;
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);

  const ROW_H = 22;
  const MS_TOP_PAD = 8;
  const MS_AREA_H = _showPins ? layers.length * ROW_H + MS_TOP_PAD : 0;
  const DATE_AXIS_H = 16;
  const TOP_AXIS_H = MS_AREA_H + DATE_AXIS_H + 4;
  const DATE_AXIS_Y = TOP_AXIS_H - 6;
  const BOTTOM_AXIS_H = 34;
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;
  const Y_AXIS_W = 28;

  /** layer id → row y 中心 */
  const layerYById = new Map<string, number>();
  layers.forEach((l, i) => {
    layerYById.set(l.id, MS_TOP_PAD + i * ROW_H + ROW_H / 2);
  });

  function clientXToDate(clientX: number): string {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return today;
    const relX = clientX - rect.left;
    const colIdx = Math.max(0, Math.round((relX - CELL / 2) / STEP));
    return addDays(dates[0], colIdx);
  }

  /** ドラッグ中の最終 date を ref に保持 (pointerUp で commit) */
  const dragLatestDateRef = useRef<string | null>(null);

  const onPinDown = (id: string) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (!onMilestoneDateChange) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = id;
    dragMovedRef.current = false;
    dragLatestDateRef.current = null;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPinMove = (id: string) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingRef.current !== id) return;
    dragMovedRef.current = true;
    const newDate = clientXToDate(e.clientX);
    dragLatestDateRef.current = newDate;
    onMilestoneDateDraft?.(id, newDate);  // live preview のみ (API は叩かない)
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (e.clientX < rect.left) container.scrollLeft -= 24;
    else if (e.clientX > rect.right) container.scrollLeft += 24;
  };
  const onPinUp = (id: string) => (e: React.PointerEvent<SVGCircleElement>) => {
    const wasDragging = draggingRef.current === id;
    if (wasDragging) draggingRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDragging && dragMovedRef.current && dragLatestDateRef.current) {
      // ドラッグ離した瞬間に 1 回だけ commit
      onMilestoneDateChange?.(id, dragLatestDateRef.current);
    }
    dragLatestDateRef.current = null;
    if (wasDragging && !dragMovedRef.current && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ id, x: e.clientX, y: e.clientY });
    }
  };

  return (
    <div className="flex">
      <div className="shrink-0 relative" style={{ width: Y_AXIS_W, height: chartHeight }}>
        <svg width={Y_AXIS_W} height={chartHeight} className="block">
          {Array.from({ length: Math.floor(maxStack / 5) }, (_, i) => (i + 1) * 5).map((n) => (
            <text key={n} x={Y_AXIS_W - 4}
              y={chartHeight - BOTTOM_AXIS_H - n * STEP + CELL / 2}
              textAnchor="end" dominantBaseline="central"
              className="fill-muted-foreground" fontSize={9}>{n}</text>
          ))}
        </svg>
        {_showPins && layers.map((l, i) => {
          const top = MS_TOP_PAD + i * ROW_H + ROW_H / 2 - 8;
          const hidden = isLayerHidden(l.id);
          return (
            <button key={`vis-${l.id}`} type="button"
              onClick={() => toggleLayerHidden(l.id)}
              className="absolute right-1 size-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              style={{ top }}
              title={hidden ? "レイヤを表示" : "レイヤを非表示"}>
              {hidden ? <EyeOff className="size-3"/> : <Eye className="size-3"/>}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
        <svg ref={svgRef} width={chartWidth} height={chartHeight} className="block touch-none">
          {todayIdx >= 0 && (
            <line x1={todayIdx * STEP + CELL / 2} y1={TOP_AXIS_H}
              x2={todayIdx * STEP + CELL / 2} y2={chartHeight - BOTTOM_AXIS_H}
              stroke="hsl(var(--foreground))" strokeWidth={1.5}
              strokeDasharray="4 3" opacity={0.7}/>
          )}

          {/* グリッド + tetris ボックス */}
          {dates.map((date, colIdx) => {
            const dayItems = grouped.get(date) ?? [];
            const x = colIdx * STEP;
            const isToday = date === today;
            return (
              <g key={date}>
                {isToday && (
                  <rect x={x - 1} y={TOP_AXIS_H} width={CELL + 2} height={maxStack * STEP}
                    fill="hsl(var(--foreground))" opacity={0.1}/>
                )}
                {Array.from({ length: maxStack }, (_, i) => (
                  <rect key={`bg-${i}`}
                    x={x} y={chartHeight - BOTTOM_AXIS_H - (i + 1) * STEP}
                    width={CELL} height={CELL} rx={2}
                    fill="none" stroke="hsl(var(--border))" strokeWidth={0.5}/>
                ))}
                {dayItems.map((item, stackIdx) => {
                  const color = item.overflow ? COLOR_OVERFLOW : item.side === "past" ? COLOR_PAST : COLOR_FUTURE;
                  const isSelected = item.problemId === selectedId;
                  const anchor = milestoneAnchors?.find((a) => a.problemId === item.problemId);
                  const by = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                  return (
                    <g key={`${item.problemId}-${stackIdx}`}>
                      {isSelected && (
                        <rect x={x - 2} y={by - 2} width={CELL + 4} height={CELL + 4} rx={3}
                          fill="none" stroke={color} strokeWidth={2} opacity={0.9} className="animate-pulse"/>
                      )}
                      <rect x={x} y={by} width={CELL} height={CELL} rx={2}
                        fill={color} opacity={isSelected ? 1 : 0.85}
                        stroke={anchor ? MS_COLOR : item.overBudget ? "#eab308" : "none"}
                        strokeWidth={anchor ? 2 : item.overBudget ? 1.5 : 0}
                        className="cursor-pointer"
                        onClick={() => (isSelected ? onOpen?.(item.problemId) : onSelect?.(item.problemId))}
                        onDoubleClick={() => onOpen?.(item.problemId)}>
                        <title>
                          {anchor ? `[${anchor.target}問目] ` : ""}
                          {item.code} {item.name ?? ""} ({Math.round(item.standardTimeSec / 60)}分)
                          {item.overBudget ? " ⚠ 1日の枠超" : ""}
                        </title>
                      </rect>
                    </g>
                  );
                })}
                {/* anchor ラベル */}
                {(() => {
                  const anchorsHere = dayItems
                    .map((it) => ({ it }))
                    .filter(({ it }) => milestoneAnchors?.some((a) => a.problemId === it.problemId));
                  if (anchorsHere.length === 0) return null;
                  const topY = chartHeight - BOTTOM_AXIS_H - dayItems.length * STEP - 4;
                  return anchorsHere.map(({ it }) => {
                    const a = milestoneAnchors!.find((x) => x.problemId === it.problemId)!;
                    return (
                      <text key={`anchor-${it.problemId}`}
                        x={x + CELL / 2} y={topY} textAnchor="middle"
                        fontSize={10} fontWeight={700} fill={MS_COLOR}
                        className="pointer-events-none select-none">{a.target}</text>
                    );
                  });
                })()}
                {(() => {
                  const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const d = new Date(`${date}T12:00:00`);
                  return (
                    <text x={x + CELL / 2} y={DATE_AXIS_Y} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>{`${d.getMonth() + 1}/${d.getDate()}`}</text>
                  );
                })()}
                {(() => {
                  const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const label = diff === 0 ? "今日" : diff > 0 ? `+${diff}` : `▲ ${Math.abs(diff)}`;
                  return (
                    <text x={x + CELL / 2} y={chartHeight - 4} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>{label}</text>
                  );
                })()}
              </g>
            );
          })}

          {/* layer 横トラック線 */}
          {_showPins && layers.map((l, i) => {
            if (isLayerHidden(l.id)) return null;
            const y = MS_TOP_PAD + i * ROW_H + ROW_H / 2;
            return (
              <line key={`track-${l.id}`}
                x1={0} y1={y} x2={chartWidth} y2={y}
                stroke="hsl(var(--border))" strokeWidth={2} opacity={0.4}
                strokeLinecap="round"/>
            );
          })}

          {/* milestone 縦線 + ピン + count */}
          {milestones.map((ms) => {
            const layer = layers.find((l) => l.id === ms.layer_id);
            if (!layer) return null;
            const hidden = isLayerHidden(layer.id);
            const idx = dates.indexOf(ms.date);
            const colIdx = idx >= 0 ? idx : Math.max(0, Math.round((new Date(`${ms.date}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) / 86400000));
            const cx = colIdx * STEP + CELL / 2;
            const rowY = layerYById.get(layer.id) ?? MS_TOP_PAD;
            const lineY1 = hidden ? MS_TOP_PAD + ROW_H / 2 : rowY;
            return (
              <g key={`ms-${ms.id}`}>
                <line x1={cx} y1={lineY1} x2={cx} y2={chartHeight - BOTTOM_AXIS_H}
                  stroke={MS_COLOR} strokeWidth={1.5} opacity={0.4}/>
                {_showPins && !hidden && (
                  <circle cx={cx} cy={rowY} r={8.1}
                    fill={MS_COLOR} opacity={0.4}
                    stroke="hsl(var(--background))" strokeWidth={2}
                    className={onMilestoneDateChange ? "cursor-grab active:cursor-grabbing" : ""}
                    onPointerDown={onPinDown(ms.id)}
                    onPointerMove={onPinMove(ms.id)}
                    onPointerUp={onPinUp(ms.id)}
                    onPointerCancel={onPinUp(ms.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ id: ms.id, x: e.clientX, y: e.clientY });
                    }}
                  />
                )}
                <text x={cx} y={chartHeight - BOTTOM_AXIS_H + 12} textAnchor="middle"
                  fontSize={10} fontWeight={700} fill={MS_COLOR}
                  className="pointer-events-none select-none">{ms.target}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* マイルストーン編集メニュー */}
      {menu && (() => {
        const m = milestones.find((x) => x.id === menu.id);
        if (!m) return null;
        return (
          <div
            className="fixed z-50 rounded-md border bg-popover text-popover-foreground shadow-md p-1.5 text-xs space-y-1"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-1">
              <Hash className="size-3.5 text-muted-foreground"/>
              <input type="number" min={0} defaultValue={m.target}
                key={`target-${m.id}-${m.target}`}
                className="h-7 w-20 px-1 text-xs border rounded bg-background tabular-nums"
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= 0 && n !== m.target) onMilestoneTargetChange?.(m.id, n);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setMenu(null);
                }}
              />
              <span className="text-[10px] text-muted-foreground">問</span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <CalendarDays className="size-3.5 text-muted-foreground"/>
              <input type="date" defaultValue={m.date}
                key={`date-${m.id}-${m.date}`}
                className="h-7 px-1 text-xs border rounded bg-background"
                onChange={(e) => {
                  if (e.target.value && e.target.value !== m.date) {
                    onMilestoneDateChange?.(m.id, e.target.value);
                  }
                }}
              />
            </div>
            <button type="button"
              className="w-full flex items-center gap-2 px-1 py-1 rounded text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => { onMilestoneRemove?.(m.id); setMenu(null); }}>
              <Trash2 className="size-3.5"/><span>削除</span>
            </button>
          </div>
        );
      })()}

      {/* 右パネル: layer 名と操作 (ドラッグ並び替え対応) */}
      {_showPins && (
        <LayerListPanel
          layers={layers}
          rowHeight={ROW_H}
          topPad={MS_TOP_PAD}
          onMilestoneAddToLayer={onMilestoneAddToLayer}
          onLayerNameChange={onLayerNameChange}
          onLayerRemove={onLayerRemove}
          onAddLayer={onAddLayer}
          onReorderLayers={onReorderLayers}
        />
      )}
    </div>
  );
});

/* ── Layer list (sortable) ────────────────────────────────── */

function LayerListPanel({
  layers, rowHeight, topPad, onMilestoneAddToLayer, onLayerNameChange, onLayerRemove, onAddLayer, onReorderLayers,
}: {
  layers: LayerView[];
  rowHeight: number;
  topPad: number;
  onMilestoneAddToLayer?: (layerId: string) => void;
  onLayerNameChange?: (id: string, newName: string) => void;
  onLayerRemove?: (id: string) => void;
  onAddLayer?: () => void;
  onReorderLayers?: (orderedLayerIds: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd(e: DragEndEvent) {
    if (!onReorderLayers) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = layers.map((l) => l.id);
    const fromIdx = ids.indexOf(String(active.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    onReorderLayers(arrayMove(ids, fromIdx, toIdx));
  }
  return (
    <div className="shrink-0 pl-2" style={{ width: 200 }}>
      <div style={{ height: topPad }}/>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {layers.map((l) => (
            <SortableLayerRow key={l.id} layer={l} rowHeight={rowHeight}
              onMilestoneAddToLayer={onMilestoneAddToLayer}
              onLayerNameChange={onLayerNameChange}
              onLayerRemove={onLayerRemove}/>
          ))}
        </SortableContext>
      </DndContext>
      {onAddLayer && (
        <button type="button" onClick={onAddLayer}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full"
          style={{ height: rowHeight }}
          title="新規レイヤを追加">
          <span className="size-4 shrink-0"/>
          <span className="size-4 shrink-0"/>
          <span className="size-4 shrink-0"/>
          <span className="flex-1 italic text-left px-1">新規レイヤ</span>
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function SortableLayerRow({
  layer, rowHeight, onMilestoneAddToLayer, onLayerNameChange, onLayerRemove,
}: {
  layer: LayerView;
  rowHeight: number;
  onMilestoneAddToLayer?: (layerId: string) => void;
  onLayerNameChange?: (id: string, newName: string) => void;
  onLayerRemove?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: layer.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: rowHeight,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-1 group bg-background">
      {/* 1. プラスマーク */}
      {onMilestoneAddToLayer ? (
        <button type="button"
          className="text-muted-foreground hover:text-foreground p-0.5"
          onClick={() => onMilestoneAddToLayer(layer.id)}
          title="このレイヤに milestone 追加">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      ) : <span className="size-4 shrink-0"/>}
      {/* 2. ドラッグハンドル (ホバー時のみ表示) */}
      <button type="button"
        {...attributes} {...listeners}
        className="text-muted-foreground hover:text-foreground p-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        title="ドラッグして並び替え">
        <GripVertical className="size-3"/>
      </button>
      {/* 3. 名前 */}
      <input type="text" value={layer.name}
        placeholder="(無題)"
        onChange={(e) => onLayerNameChange?.(layer.id, e.target.value)}
        className="flex-1 min-w-0 h-5 px-1 text-[10px] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none"/>
      {/* 4. ゴミ箱 */}
      {onLayerRemove && (
        <button type="button"
          className="text-muted-foreground hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onLayerRemove(layer.id)}
          title="レイヤ削除">
          <Trash2 className="size-3"/>
        </button>
      )}
    </div>
  );
}
