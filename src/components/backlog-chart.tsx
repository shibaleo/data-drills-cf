/**
 * Backlog Tetris chart.
 * Receives layers (horizontal tracks) and milestones (pins on layers) as separate entities.
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AllocatedProblem, Milestone } from "@/lib/backlog-allocate";
import { blockColor, blockBorder } from "@/lib/block-color";
import { formatRelDay } from "@/lib/relative-day";
import { CELL, STEP, Y_AXIS_W, MIN_ROWS } from "@/lib/chart-constants";

export type BacklogChartHandle = {
  getCenterDate(): string;
};

export type LayerView = {
  id: string;
  name: string;
  color?: string | null;
  opacity_pct?: number | null;
  line_style?: "solid" | "dashed" | "dotted" | null;
  line_width?: number | null;
  /** UI 表示用: そのレイヤの「完了数 / 最終 target」(なければ undefined) */
  progress?: { done: number; total: number } | null;
};
export type MilestoneView = {
  id: string;
  layer_id: string;
  target: number;
  date: string;
};

/**
 * BacklogChart のスタック上に「allocated 由来ではない overlay ブロック」を追加する用。
 * /plan の FSRS-projected smooth-future の描画に使う。色は呼び出し側で指定 (status color など)。
 * 過去/未来分類や overflow/over-budget の計算はしない。
 */
export type OverlayBlock = {
  problemId: string;
  code: string;
  name: string | null;
  date: string;
  color: string;
  /** tooltip 用ラベル (e.g. status 名)。 */
  statusName?: string | null;
  /** 個別 opacity (省略時 0.85)。過去実績ブロックは PAST_OPACITY = 0.5 を渡す。 */
  opacity?: number;
  /** 未解消 (= future column) で stability 昇順に積み上げるためのキー。省略可。 */
  stabilityDays?: number;
  /** 用途分類。caller 側のフィルタで使う:
   *   - "throughput": 過去実績 (= re-answer overlay。1 answer = 1 block)
   *   - "next-step":  各 problem の "今すぐ 1 回" の next entry (review 由来)
   *   - "forecast":   next-step / 初回未着手の以降の cascade 予測
   */
  kind?: "throughput" | "next-step" | "forecast";
};

type BacklogChartProps = {
  items: AllocatedProblem[];
  /** allocated と同じ tetris カラムに積む overlay ブロック (smooth-future projection 等)。 */
  overlayItems?: OverlayBlock[];
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
  /** ピンを別レイヤ行にドラッグ中 (= live preview)。 */
  onMilestoneLayerDraft?: (id: string, newLayerId: string) => void;
  /** ピンを別レイヤ行にドラッグ完了 (= 確定)。 */
  onMilestoneLayerChange?: (id: string, newLayerId: string) => void;
  onMilestoneTargetChange?: (id: string, newTarget: number) => void;
  onMilestoneRemove?: (id: string) => void;
  /** 各 layer に milestone 追加 (date 省略時はセンター日付) */
  onMilestoneAddToLayer?: (layerId: string, atDate?: string) => void;
  /** 各 layer の名前変更 */
  onLayerNameChange?: (id: string, newName: string) => void;
  /** 各 layer の色変更 (hex string or null) */
  onLayerColorChange?: (id: string, newColor: string | null) => void;
  /** opacity / 線種 / 太さ */
  onLayerStyleChange?: (id: string, patch: { opacity_pct?: number | null; line_style?: "solid" | "dashed" | "dotted" | null; line_width?: number | null }) => void;
  /** layer 削除 */
  onLayerRemove?: (id: string) => void;
  /** layer 追加 */
  onAddLayer?: () => void;
  /** layer 並び替え (= 並び替え後の id 配列を渡す) */
  onReorderLayers?: (orderedLayerIds: string[]) => void;
  /** 右側パネルの下に表示する追加コンテンツ (= 戦略数値 etc) */
  rightPanelExtra?: React.ReactNode;
  showMilestonePins?: boolean;
  /** 各 milestone の「実際に N 問目に相当する problem」をハイライトするためのアンカー */
  milestoneAnchors?: { target: number; problemId: string | null; layer_id?: string }[];
  /** 表示/非表示状態を呼び出し側で管理する (未指定なら内部 state)。 */
  hiddenLayerIds?: Set<string>;
  onHiddenLayersChange?: (next: Set<string>) => void;
  /** today 線をドラッグして新しい今日 (YYYY-MM-DD) を返す。指定すると線が掴める。 */
  onTodayDrag?: (newDate: string) => void;
  /** 日付軸ラベル基準 (M/D・relDay)。未指定なら today。 */
  realToday?: string;
  /** tetris の最大段数を強制 (number)。未指定/null なら maxCount+2 自動。 */
  maxStackOverride?: number | null;
};


const MS_COLOR = "#f59e0b";
const PAST_OPACITY = 0.5;
const PAST_GRAY_MIX = 0.3;  // 過去 milestone はグレイ 30% + 元色 70%

function mixGray(hex: string, t = PAST_GRAY_MIX): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gr = 0x88;
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${to2(r * (1 - t) + gr * t)}${to2(g * (1 - t) + gr * t)}${to2(b * (1 - t) + gr * t)}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const BacklogChart = forwardRef<BacklogChartHandle, BacklogChartProps>(function BacklogChartImpl({
  items,
  overlayItems,
  layers,
  milestones,
  today,
  selectedId,
  onSelect,
  onOpen,
  onMilestoneDateDraft,
  onMilestoneDateChange,
  onMilestoneLayerDraft,
  onMilestoneLayerChange,
  onMilestoneTargetChange,
  onMilestoneRemove,
  onMilestoneAddToLayer,
  onLayerNameChange,
  onLayerColorChange,
  onLayerStyleChange,
  onLayerRemove,
  onAddLayer,
  onReorderLayers,
  rightPanelExtra,
  maxStackOverride,
  showMilestonePins,
  milestoneAnchors,
  hiddenLayerIds,
  onHiddenLayersChange,
  onTodayDrag,
  realToday,
}: BacklogChartProps, ref) {
  const axisToday = realToday ?? today;
  const _showPins = showMilestonePins ?? true;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [internalHidden, setInternalHidden] = useState<Set<string>>(new Set());
  const hiddenLayers = hiddenLayerIds ?? internalHidden;
  const updateHidden = (next: Set<string>) => {
    if (onHiddenLayersChange) onHiddenLayersChange(next);
    else setInternalHidden(next);
  };

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
    const next = new Set(hiddenLayers);
    if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
    updateHidden(next);
  }
  const isLayerHidden = (layerId: string) => hiddenLayers.has(layerId);
  /** 非表示 layer に属する anchor は除外 (anchor 枠線描画用) */
  const visibleAnchors = (milestoneAnchors ?? []).filter(
    (a) => !a.layer_id || !hiddenLayers.has(a.layer_id),
  );

  type StackItem =
    | { kind: "alloc"; alloc: AllocatedProblem }
    | { kind: "overlay"; ov: OverlayBlock };
  // 積み上げ順 (下 → 上):
  //   実績 (past column): status 進行順 First → Miss → Rough → Fair → Fluent → Done
  //     - alloc past は statusName=null/First 扱い → 下端
  //     - past throughput overlay は prevStatusName で順位付け
  //   未解消 (future column): stabilityDays ASC で積む (短い review interval が下)
  //     - alloc future (= 未着手 First) は stability 0 = 下端
  //     - smooth-future overlay は OverlayBlock.stabilityDays を caller が渡す
  const actualStatusOrder = (name: string | null | undefined): number => {
    switch (name) {
      case "Miss": return 1;
      case "Rough": return 2;
      case "Fair": return 3;
      case "Fluent": return 4;
      case "Solid": return 5;
      default: return 0;  // First / null / unknown
    }
  };
  const grouped = useMemo(() => {
    const map = new Map<string, StackItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push({ kind: "alloc", alloc: item });
      map.set(item.date, list);
    }
    for (const ov of overlayItems ?? []) {
      const list = map.get(ov.date) ?? [];
      list.push({ kind: "overlay", ov });
      map.set(ov.date, list);
    }
    // item 内在の actual/planned 判別 (column 位置に依存しない):
    //   - alloc.side === "past" → 実績
    //   - past throughput overlay は stabilityDays を持たない → 実績
    //   - alloc.side === "future" → 予定
    //   - smooth-future overlay は stabilityDays を持つ → 予定
    const itemIsActual = (it: StackItem): boolean =>
      it.kind === "alloc"
        ? it.alloc.side === "past"
        : it.ov.stabilityDays === undefined;
    const rank = (it: StackItem): number => {
      if (itemIsActual(it)) {
        const name = it.kind === "alloc" ? null : it.ov.statusName;
        return actualStatusOrder(name);                                 // 0..5
      }
      if (it.kind === "alloc") return 100;                              // 未着手 (First) = 予定下端
      return 100 + (it.ov.stabilityDays ?? 9999);
    };
    for (const list of map.values()) {
      list.sort((a, b) => rank(a) - rank(b));
    }
    return map;
  }, [items, overlayItems]);

  const { dates, todayIdx } = useMemo(() => {
    const allDates = [
      today,
      ...items.map((i) => i.date),
      ...milestones.map((m) => m.date),
      ...(overlayItems ?? []).map((o) => o.date),
    ];
    const minDate = allDates.reduce((a, b) => (a < b ? a : b), today);
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b), today);
    const rangeStart = addDays(minDate < today ? minDate : today, -7);
    const rangeEnd = addDays(maxDate > today ? maxDate : today, 14);
    const ds: string[] = [];
    let d = rangeStart;
    while (d <= rangeEnd) { ds.push(d); d = addDays(d, 1); }
    return { dates: ds, todayIdx: ds.indexOf(today) };
  }, [items, milestones, overlayItems, today]);
  const axisIdx = dates.indexOf(axisToday);

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

  // override が指定された場合は「表示可能ブロック数 = override、フレーム = override+2」
  // (他ページと同じ: 上に空き 2 段の余白を残す)。auto なら maxCount+2 で従来通り。
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const renderCap = maxStackOverride != null ? Math.max(1, maxStackOverride) : Infinity;
  const maxStack = maxStackOverride != null
    ? Math.max(MIN_ROWS, maxStackOverride + 2)
    : Math.max(MIN_ROWS, maxCount + 2);

  const ROW_H = 22;
  const MS_TOP_PAD = 8;
  const MS_AREA_H = _showPins ? layers.length * ROW_H + MS_TOP_PAD : 0;
  const DATE_AXIS_H = 16;
  const TOP_AXIS_H = MS_AREA_H + DATE_AXIS_H + 4;
  const DATE_AXIS_Y = TOP_AXIS_H - 6;
  const BOTTOM_AXIS_H = 34;
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;

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
    onMilestoneDateDraft?.(id, newDate);  // x 方向のみ。layer は menu 経由で変更する設計。
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
    if (wasDragging && dragMovedRef.current) {
      if (dragLatestDateRef.current) onMilestoneDateChange?.(id, dragLatestDateRef.current);
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
              title={hidden ? "Show layer" : "Hide layer"}>
              {hidden ? <EyeOff className="size-3"/> : <Eye className="size-3"/>}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
        <svg ref={svgRef} width={chartWidth} height={chartHeight} className="block touch-none"
          onPointerDown={(e) => {
            if (!onTodayDrag) return;
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const cursorX = todayIdx * STEP + CELL / 2;
            if (Math.abs(x - cursorX) > 8) return;
            e.preventDefault();
            e.stopPropagation();
            svg.setPointerCapture(e.pointerId);
            svg.style.cursor = "grabbing";
            const move = (ev: PointerEvent) => {
              const px = ev.clientX - rect.left;
              const idx = Math.round((px - CELL / 2) / STEP);
              const clamped = Math.max(0, Math.min(dates.length - 1, idx));
              onTodayDrag(dates[clamped]);
            };
            const up = (ev: PointerEvent) => {
              svg.releasePointerCapture(ev.pointerId);
              svg.style.cursor = "";
              svg.removeEventListener("pointermove", move);
              svg.removeEventListener("pointerup", up);
            };
            svg.addEventListener("pointermove", move);
            svg.addEventListener("pointerup", up);
          }}>
          {todayIdx >= 0 && (
            <>
              <line x1={todayIdx * STEP + CELL / 2} y1={TOP_AXIS_H}
                x2={todayIdx * STEP + CELL / 2} y2={chartHeight - BOTTOM_AXIS_H}
                stroke="hsl(var(--foreground))" strokeWidth={1.5}
                strokeDasharray="4 3" opacity={0.7}/>
              {onTodayDrag && (
                <line x1={todayIdx * STEP + CELL / 2} y1={TOP_AXIS_H}
                  x2={todayIdx * STEP + CELL / 2} y2={chartHeight - BOTTOM_AXIS_H}
                  stroke="transparent" strokeWidth={14} style={{ cursor: "grab" }}/>
              )}
            </>
          )}

          {/* selected problem のブロックを時間順に結ぶ polyline (ブロック背面)
              past = solid (確定履歴), future = dashed (予測) */}
          {selectedId && (() => {
            const pastPts: { x: number; y: number }[] = [];
            const futurePts: { x: number; y: number }[] = [];
            dates.forEach((date, colIdx) => {
              const allDayItems = grouped.get(date) ?? [];
              const dayItems = renderCap === Infinity ? allDayItems : allDayItems.slice(0, renderCap);
              dayItems.forEach((it, stackIdx) => {
                const pid = it.kind === "alloc" ? it.alloc.problemId : it.ov.problemId;
                if (pid !== selectedId) return;
                const cx = colIdx * STEP + CELL / 2;
                const cy = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP + CELL / 2;
                if (date <= today) pastPts.push({ x: cx, y: cy });
                else futurePts.push({ x: cx, y: cy });
              });
            });
            const toPath = (ps: { x: number; y: number }[]) =>
              ps.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            // future の起点に past の最終点を付けて連続させる (= 渡り segment は dashed)
            const futureWithBridge = pastPts.length > 0 && futurePts.length > 0
              ? [pastPts[pastPts.length - 1], ...futurePts]
              : futurePts;
            return (
              <g className="pointer-events-none">
                {pastPts.length >= 2 && (
                  <path d={toPath(pastPts)} fill="none"
                    stroke="hsl(var(--foreground))" strokeWidth={1.25}
                    strokeLinejoin="round" strokeLinecap="round" opacity={0.55}/>
                )}
                {futureWithBridge.length >= 2 && (
                  <path d={toPath(futureWithBridge)} fill="none"
                    stroke="hsl(var(--foreground))" strokeWidth={1.25}
                    strokeDasharray="3 3"
                    strokeLinejoin="round" strokeLinecap="round" opacity={0.55}/>
                )}
              </g>
            );
          })()}

          {/* グリッド + tetris ボックス */}
          {dates.map((date, colIdx) => {
            const allDayItems = grouped.get(date) ?? [];
            const dayItems = renderCap === Infinity ? allDayItems : allDayItems.slice(0, renderCap);
            const truncated = allDayItems.length - dayItems.length;
            const x = colIdx * STEP;
            const isToday = date === axisToday;  // 軸ラベルハイライト基準は現実の今日
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
                {dayItems.map((stackItem, stackIdx) => {
                  const by = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                  if (stackItem.kind === "overlay") {
                    const o = stackItem.ov;
                    const isSelectedOv = o.problemId === selectedId;
                    return (
                      <g key={`ov-${o.problemId}-${stackIdx}`}>
                        {isSelectedOv && (
                          <rect x={x - 2} y={by - 2} width={CELL + 4} height={CELL + 4} rx={3}
                            fill="none" stroke={o.color} strokeWidth={2} opacity={0.9} className="animate-pulse"/>
                        )}
                        <rect x={x} y={by} width={CELL} height={CELL} rx={2}
                          fill={o.color} opacity={isSelectedOv ? 1 : (o.opacity ?? 0.85)}
                          className="cursor-pointer"
                          onClick={() => onSelect?.(o.problemId)}
                          onDoubleClick={() => onOpen?.(o.problemId)}>
                          <title>{o.code} {o.name ?? ""}{o.statusName ? ` (${o.statusName})` : ""}</title>
                        </rect>
                      </g>
                    );
                  }
                  const item = stackItem.alloc;
                  const kind = item.side === "past"
                    ? { side: "past" as const, prevStatusColor: null }
                    : { side: "future" as const, overflow: item.overflow, overBudget: item.overBudget };
                  const color = blockColor(kind);
                  const warn = blockBorder(kind);
                  const isSelected = item.problemId === selectedId;
                  const anchor = visibleAnchors.find((a) => a.problemId === item.problemId);
                  const anchorLayer = anchor?.layer_id ? layers.find((l) => l.id === anchor.layer_id) : null;
                  const anchorIsPast = anchor && date < today;
                  const anchorColor = anchorIsPast ? mixGray(anchorLayer?.color || MS_COLOR) : (anchorLayer?.color || MS_COLOR);
                  const anchorOpacity = anchorIsPast ? PAST_OPACITY : (anchorLayer ? (anchorLayer.opacity_pct ?? 40) / 100 : 1);
                  // anchor (milestone tie) > warn border > selection highlight, all stroked on the same rect.
                  const stroke = anchor ? anchorColor : warn?.stroke ?? "none";
                  const strokeWidth = anchor ? 2 : warn?.width ?? 0;
                  const strokeDasharray = !anchor && warn?.dashed ? "2 2" : undefined;
                  return (
                    <g key={`${item.problemId}-${stackIdx}`}>
                      {isSelected && (
                        <rect x={x - 2} y={by - 2} width={CELL + 4} height={CELL + 4} rx={3}
                          fill="none" stroke={color} strokeWidth={2} opacity={0.9} className="animate-pulse"/>
                      )}
                      <rect x={x} y={by} width={CELL} height={CELL} rx={2}
                        fill={color} opacity={isSelected ? 1 : item.side === "past" ? PAST_OPACITY : 0.85}
                        stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray}
                        strokeOpacity={anchor ? anchorOpacity : 1}
                        className="cursor-pointer"
                        onClick={() => (isSelected ? onOpen?.(item.problemId) : onSelect?.(item.problemId))}
                        onDoubleClick={() => onOpen?.(item.problemId)}>
                        <title>
                          {anchor ? `[#${anchor.target}] ` : ""}
                          {item.code} {item.name ?? ""} ({Math.round(item.standardTimeSec / 60)} min)
                          {item.overflow ? " ⚠ Overflow (past milestone)" : item.overBudget ? " ⚠ Over daily budget" : ""}
                        </title>
                      </rect>
                    </g>
                  );
                })}
                {truncated > 0 && (() => {
                  const by = chartHeight - BOTTOM_AXIS_H - (dayItems.length + 1) * STEP;
                  return (
                    <text key="truncated" x={x + CELL / 2} y={by + CELL / 2 + 3}
                      textAnchor="middle" fontSize={9} fontWeight={700}
                      fill="hsl(var(--muted-foreground))"
                      className="pointer-events-none select-none">+{truncated}</text>
                  );
                })()}
                {/* anchor ラベル — overlay は無視し alloc のみで判定 */}
                {(() => {
                  const allocItems = dayItems.filter((it) => it.kind === "alloc").map((it) => it.alloc);
                  const anchorsHere = allocItems.filter((it) =>
                    visibleAnchors.some((a) => a.problemId === it.problemId),
                  );
                  if (anchorsHere.length === 0) return null;
                  const topY = chartHeight - BOTTOM_AXIS_H - dayItems.length * STEP - 4;
                  const aPast = date < today;
                  return anchorsHere.map((it) => {
                    const a = visibleAnchors.find((x) => x.problemId === it.problemId)!;
                    const aLayer = a.layer_id ? layers.find((l) => l.id === a.layer_id) : null;
                    const rawCol = aLayer?.color || MS_COLOR;
                    const col = aPast ? mixGray(rawCol) : rawCol;
                    const op = aPast ? PAST_OPACITY : (aLayer ? (aLayer.opacity_pct ?? 40) / 100 : 1);
                    return (
                      <text key={`anchor-${it.problemId}`}
                        x={x + CELL / 2} y={topY} textAnchor="middle"
                        fontSize={10} fontWeight={700} fill={col} opacity={op}
                        className="pointer-events-none select-none">{a.target}</text>
                    );
                  });
                })()}
                {(() => {
                  const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const d = new Date(`${date}T12:00:00`);
                  return (
                    <text x={x + CELL / 2} y={DATE_AXIS_Y} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>{`${d.getMonth() + 1}/${d.getDate()}`}</text>
                  );
                })()}
                {(() => {
                  const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const label = formatRelDay(diff);
                  return (
                    <text x={x + CELL / 2} y={chartHeight - 4} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>{label}</text>
                  );
                })()}
              </g>
            );
          })}

          {/* layer 横トラック線 + クリックで milestone 追加可能なエリア */}
          {_showPins && layers.map((l, i) => {
            if (isLayerHidden(l.id)) return null;
            const y = MS_TOP_PAD + i * ROW_H + ROW_H / 2;
            const rowTop = MS_TOP_PAD + i * ROW_H;
            return (
              <g key={`track-${l.id}`}>
                <line x1={0} y1={y} x2={chartWidth} y2={y}
                  stroke="hsl(var(--border))" strokeWidth={2} opacity={0.4}
                  strokeLinecap="round"/>
                {onMilestoneAddToLayer && (
                  <rect x={0} y={rowTop} width={chartWidth} height={ROW_H}
                    fill="transparent"
                    className="cursor-copy"
                    onClick={(e) => {
                      // ピン上のクリックは pin 側で stopPropagation してるのでここには来ない
                      onMilestoneAddToLayer(l.id, clientXToDate(e.clientX));
                    }}>
                    <title>Click to add milestone</title>
                  </rect>
                )}
              </g>
            );
          })}

          {/* milestone 縦線 + ピン + count */}
          {milestones.map((ms) => {
            const layer = layers.find((l) => l.id === ms.layer_id);
            if (!layer) return null;
            const hidden = isLayerHidden(layer.id);
            if (hidden) return null;
            const isPast = ms.date < today;
            const rawColor = layer.color || MS_COLOR;
            const layerColor = isPast ? mixGray(rawColor) : rawColor;
            const baseOpacity = (layer.opacity_pct ?? 40) / 100;
            const layerOpacity = isPast ? PAST_OPACITY : baseOpacity;
            const layerLineWidth = layer.line_width ?? 1.5;
            const layerLineDash = layer.line_style === "dashed" ? "4 3" : layer.line_style === "dotted" ? "1 3" : undefined;
            const idx = dates.indexOf(ms.date);
            const colIdx = idx >= 0 ? idx : Math.max(0, Math.round((new Date(`${ms.date}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) / 86400000));
            const cx = colIdx * STEP + CELL / 2;
            const rowY = layerYById.get(layer.id) ?? MS_TOP_PAD;
            // ピン非表示 or layer 個別非表示時は、すべてグリッド最上段から (= today 破線と同じ開始位置)
            const lineY1 = (!_showPins || hidden) ? TOP_AXIS_H : rowY;
            const lineDraggable = !!onMilestoneDateChange;
            return (
              <g key={`ms-${ms.id}`}>
                <line x1={cx} y1={lineY1} x2={cx} y2={chartHeight - BOTTOM_AXIS_H}
                  stroke={layerColor} strokeWidth={layerLineWidth} opacity={layerOpacity}
                  strokeDasharray={layerLineDash}/>
                {lineDraggable && (
                  <line x1={cx} y1={lineY1} x2={cx} y2={chartHeight - BOTTOM_AXIS_H}
                    stroke="transparent" strokeWidth={12}
                    style={{ cursor: "grab" }}
                    onPointerDown={onPinDown(ms.id) as unknown as React.PointerEventHandler<SVGLineElement>}
                    onPointerMove={onPinMove(ms.id) as unknown as React.PointerEventHandler<SVGLineElement>}
                    onPointerUp={onPinUp(ms.id) as unknown as React.PointerEventHandler<SVGLineElement>}
                    onPointerCancel={onPinUp(ms.id) as unknown as React.PointerEventHandler<SVGLineElement>}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ id: ms.id, x: e.clientX, y: e.clientY });
                    }}
                  />
                )}
                {_showPins && !hidden && (
                  <circle cx={cx} cy={rowY} r={8.1}
                    fill={layerColor} opacity={layerOpacity}
                    stroke="hsl(var(--background))" strokeWidth={2}
                    className={onMilestoneDateChange ? "cursor-grab active:cursor-grabbing" : ""}
                    onClick={(e) => e.stopPropagation()}
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
                  fontSize={10} fontWeight={700} fill={layerColor} opacity={layerOpacity}
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
              <span className="text-[10px] text-muted-foreground">q</span>
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
              <Trash2 className="size-3.5"/><span>Delete</span>
            </button>
          </div>
        );
      })()}

      {/* 右パネル: layer 名と操作 (ドラッグ並び替え対応) */}
      {_showPins && (
        <div className="shrink-0 flex flex-col">
          <LayerListPanel
            layers={layers}
            rowHeight={ROW_H}
            topPad={MS_TOP_PAD}
            onMilestoneAddToLayer={onMilestoneAddToLayer}
            onLayerNameChange={onLayerNameChange}
            onLayerColorChange={onLayerColorChange}
            onLayerStyleChange={onLayerStyleChange}
            onLayerRemove={onLayerRemove}
            onAddLayer={onAddLayer}
            onReorderLayers={onReorderLayers}
          />
          {rightPanelExtra && <div className="pl-2 mt-3">{rightPanelExtra}</div>}
        </div>
      )}
    </div>
  );
});

/* ── Layer list (sortable) ────────────────────────────────── */

type LayerStylePatch = { opacity_pct?: number | null; line_style?: "solid" | "dashed" | "dotted" | null; line_width?: number | null };
function LayerListPanel({
  layers, rowHeight, topPad, onMilestoneAddToLayer, onLayerNameChange, onLayerColorChange, onLayerStyleChange, onLayerRemove, onAddLayer, onReorderLayers,
}: {
  layers: LayerView[];
  rowHeight: number;
  topPad: number;
  onMilestoneAddToLayer?: (layerId: string) => void;
  onLayerNameChange?: (id: string, newName: string) => void;
  onLayerColorChange?: (id: string, newColor: string | null) => void;
  onLayerStyleChange?: (id: string, patch: LayerStylePatch) => void;
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
              onLayerColorChange={onLayerColorChange}
              onLayerStyleChange={onLayerStyleChange}
              onLayerRemove={onLayerRemove}/>
          ))}
        </SortableContext>
      </DndContext>
      {onAddLayer && (
        <button type="button" onClick={onAddLayer}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full"
          style={{ height: rowHeight }}
          title="Add new layer">
          <span className="size-4 shrink-0"/>
          <span className="size-4 shrink-0"/>
          <span className="size-4 shrink-0"/>
          <span className="flex-1 italic text-left px-1">New layer</span>
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function SortableLayerRow({
  layer, rowHeight, onMilestoneAddToLayer, onLayerNameChange, onLayerColorChange, onLayerStyleChange, onLayerRemove,
}: {
  layer: LayerView;
  rowHeight: number;
  onMilestoneAddToLayer?: (layerId: string) => void;
  onLayerNameChange?: (id: string, newName: string) => void;
  onLayerColorChange?: (id: string, newColor: string | null) => void;
  onLayerStyleChange?: (id: string, patch: LayerStylePatch) => void;
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
          title="Add milestone to this layer">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      ) : <span className="size-4 shrink-0"/>}
      {/* 2. ドラッグハンドル (常に薄く表示、ホバーで強調) */}
      <button type="button"
        {...attributes} {...listeners}
        className="text-muted-foreground/40 hover:text-foreground p-0.5 cursor-grab active:cursor-grabbing transition-opacity"
        title="Drag to reorder">
        <GripVertical className="size-3"/>
      </button>
      {/* スタイル設定 popover (色 / opacity / 線種 / 太さ) */}
      <LayerStylePopover layer={layer}
        onLayerColorChange={onLayerColorChange}
        onLayerStyleChange={onLayerStyleChange}/>
      {/* 3. 名前 */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <input type="text" value={layer.name}
          placeholder="(untitled)"
          onChange={(e) => onLayerNameChange?.(layer.id, e.target.value)}
          className="flex-1 min-w-0 h-5 px-1 text-[10px] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none"/>
        {layer.progress && (
          <span className="text-[9px] tabular-nums text-muted-foreground shrink-0"
            title={`${layer.progress.done} / ${layer.progress.total}`}>
            {Math.round((layer.progress.done * 100) / Math.max(1, layer.progress.total))} %
          </span>
        )}
      </div>
      {/* 4. ゴミ箱 */}
      {onLayerRemove && (
        <button type="button"
          className="text-muted-foreground hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onLayerRemove(layer.id)}
          title="Delete layer">
          <Trash2 className="size-3"/>
        </button>
      )}
    </div>
  );
}

function LayerStylePopover({
  layer, onLayerColorChange, onLayerStyleChange,
}: {
  layer: LayerView;
  onLayerColorChange?: (id: string, newColor: string | null) => void;
  onLayerStyleChange?: (id: string, patch: LayerStylePatch) => void;
}) {
  const color = layer.color || "#f59e0b";
  const opacity = layer.opacity_pct ?? 40;
  const lineStyle = layer.line_style ?? "solid";
  const lineWidth = layer.line_width ?? 2;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Style (color / opacity / line)"
          className="size-3.5 rounded-full border shrink-0 cursor-pointer"
          style={{ backgroundColor: color }}/>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3 space-y-2" align="start">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-14">Color</span>
          <input type="color" value={color}
            onChange={(e) => onLayerColorChange?.(layer.id, e.target.value)}
            className="h-6 w-12 cursor-pointer rounded border bg-transparent"/>
          <button type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => onLayerColorChange?.(layer.id, null)}
            title="Reset to default">Reset</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
          <input type="range" min={10} max={100} step={5} value={opacity}
            onChange={(e) => onLayerStyleChange?.(layer.id, { opacity_pct: parseInt(e.target.value, 10) })}
            className="flex-1"/>
          <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">{opacity} %</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-14">Line</span>
          <select value={lineStyle}
            onChange={(e) => onLayerStyleChange?.(layer.id, { line_style: e.target.value as "solid" | "dashed" | "dotted" })}
            className="flex-1 h-6 text-xs border rounded bg-background px-1">
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-14">Width</span>
          <input type="range" min={1} max={5} step={1} value={lineWidth}
            onChange={(e) => onLayerStyleChange?.(layer.id, { line_width: parseInt(e.target.value, 10) })}
            className="flex-1"/>
          <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">{lineWidth} px</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
