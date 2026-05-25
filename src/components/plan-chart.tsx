/**
 * Plan 用 Tetris チャート。
 * milestone 縦線にドラッグハンドルを付けて、線そのものを動かして日付を変更できる。
 */
import { useEffect, useMemo, useRef } from "react";
import type { AllocatedProblem, Milestone } from "@/lib/plan-allocate";

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

export function PlanChart({
  items,
  milestones,
  today,
  selectedId,
  onSelect,
  onMilestoneDateChange,
  showMilestonePins,
}: {
  items: AllocatedProblem[];
  milestones: Milestone[];
  today: string;
  selectedId?: string | null;
  onSelect?: (problemId: string) => void;
  /** milestone のドラッグハンドルを動かした時のコールバック。index は milestones 配列のインデックス。 */
  onMilestoneDateChange?: (index: number, newDate: string) => void;
  /** milestone ピン (count ラベル + 円ハンドル) を描画するか。false の時も縦線と横トラック線は出す。 */
  showMilestonePins?: boolean;
}) {
  const _showPins = showMilestonePins ?? true;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!scrollRef.current || todayIdx < 0) return;
    const todayX = todayIdx * STEP;
    scrollRef.current.scrollLeft = todayX - scrollRef.current.clientWidth / 3;
  }, [todayIdx]);

  const MIN_ROWS = 10;
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);
  // ピン表示時: スライダー行 + 日付行 + padding、非表示時: 日付行 + padding
  const TOP_AXIS_H = _showPins ? 48 : 22;
  const PIN_Y = 20;  // ピン円とトラック線の y 座標 (ピン表示時のみ使用)
  const DATE_AXIS_Y = TOP_AXIS_H - 8;  // 絶対日付ラベル baseline
  const BOTTOM_AXIS_H = 34;  // 相対日付ラベル + milestone count を内側に格納
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;
  const Y_AXIS_W = 28;

  /** SVG client X 座標 → date 文字列。range 外でも addDays で算出 (chart は再 render で伸びる)。 */
  function clientXToDate(clientX: number): string {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return today;
    const relX = clientX - rect.left;
    const colIdx = Math.max(0, Math.round((relX - CELL / 2) / STEP));
    return addDays(dates[0], colIdx);
  }

  const onPinDown = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (!onMilestoneDateChange) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = i;
    (e.target as Element).setPointerCapture(e.pointerId);
    onMilestoneDateChange(i, clientXToDate(e.clientX));
  };
  const onPinMove = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingRef.current !== i) return;
    onMilestoneDateChange?.(i, clientXToDate(e.clientX));
  };
  const onPinUp = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingRef.current === i) draggingRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return (
    <div className="flex">
      <svg width={Y_AXIS_W} height={chartHeight} className="block shrink-0">
        {Array.from({ length: Math.floor(maxStack / 5) }, (_, i) => (i + 1) * 5).map((n) => (
          <text key={n} x={Y_AXIS_W - 4}
            y={chartHeight - BOTTOM_AXIS_H - n * STEP + CELL / 2}
            textAnchor="end" dominantBaseline="central"
            className="fill-muted-foreground" fontSize={9}>{n}</text>
        ))}
      </svg>
      <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0">
        <svg ref={svgRef} width={chartWidth} height={chartHeight} className="block touch-none">
          {todayIdx >= 0 && (
            <line x1={todayIdx * STEP + CELL / 2} y1={TOP_AXIS_H}
              x2={todayIdx * STEP + CELL / 2} y2={chartHeight - BOTTOM_AXIS_H}
              stroke="hsl(var(--foreground))" strokeWidth={1}
              strokeDasharray="3 3" opacity={0.4}/>
          )}
          {dates.map((date, colIdx) => {
            const dayItems = grouped.get(date) ?? [];
            const x = colIdx * STEP;
            const isToday = date === today;
            return (
              <g key={date}>
                {isToday && (
                  <rect x={x - 1} y={TOP_AXIS_H} width={CELL + 2} height={maxStack * STEP}
                    fill="hsl(var(--foreground))" opacity={0.06}/>
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
                  const by = chartHeight - BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                  return (
                    <g key={`${item.problemId}-${stackIdx}`}>
                      {isSelected && (
                        <rect x={x - 2} y={by - 2} width={CELL + 4} height={CELL + 4} rx={3}
                          fill="none" stroke={color} strokeWidth={2} opacity={0.9} className="animate-pulse"/>
                      )}
                      <rect x={x} y={by} width={CELL} height={CELL} rx={2}
                        fill={color} opacity={isSelected ? 1 : 0.85}
                        stroke={item.overBudget ? "#eab308" : "none"}
                        strokeWidth={item.overBudget ? 1.5 : 0}
                        className="cursor-pointer"
                        onClick={() => onSelect?.(item.problemId)}>
                        <title>{item.code} {item.name ?? ""} ({Math.round(item.standardTimeSec / 60)}分){item.overBudget ? " ⚠ 1日の枠超" : ""}</title>
                      </rect>
                    </g>
                  );
                })}
                {/* 上: 絶対日付 (7 日おき + 今日) */}
                {(() => {
                  const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const d = new Date(`${date}T12:00:00`);
                  return (
                    <text x={x + CELL / 2} y={DATE_AXIS_Y} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>
                      {`${d.getMonth() + 1}/${d.getDate()}`}
                    </text>
                  );
                })()}
                {/* 下: 相対日付 */}
                {(() => {
                  const diff = todayIdx >= 0 ? colIdx - todayIdx : 0;
                  if (diff % 7 !== 0) return null;
                  const label = diff === 0 ? "今日" : diff > 0 ? `+${diff}` : `▲${Math.abs(diff)}`;
                  return (
                    <text x={x + CELL / 2} y={chartHeight - 4} textAnchor="middle"
                      className="fill-muted-foreground" fontSize={9}
                      fontWeight={isToday ? 700 : 400}>{label}</text>
                  );
                })()}
              </g>
            );
          })}
          {/* milestone 用の横トラック線 (schedule のスライダーと同じ。横スクロールに追従) */}
          {_showPins && milestones.length > 0 && (
            <line x1={0} y1={PIN_Y} x2={chartWidth} y2={PIN_Y}
              stroke="hsl(var(--border))" strokeWidth={2} strokeLinecap="round"/>
          )}
          {/* milestone 縦線 + (任意) ドラッグ可能ハンドル (最後に描画して最前面に) */}
          {milestones.map((ms, i) => {
            const idx = dates.indexOf(ms.date);
            // dates 範囲外でも仮想 idx で表示 (chart は次 render で広がる)
            const colIdx = idx >= 0 ? idx : Math.max(0, Math.round((new Date(`${ms.date}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) / 86400000));
            const cx = colIdx * STEP + CELL / 2;
            return (
              <g key={`ms-${i}`}>
                <line x1={cx} y1={TOP_AXIS_H} x2={cx} y2={chartHeight - BOTTOM_AXIS_H}
                  stroke={MS_COLOR} strokeWidth={1.5} opacity={0.6}/>
                {_showPins && (
                  <circle cx={cx} cy={PIN_Y} r={9}
                    fill={MS_COLOR}
                    stroke="hsl(var(--background))" strokeWidth={2}
                    className={onMilestoneDateChange ? "cursor-grab active:cursor-grabbing" : ""}
                    onPointerDown={onPinDown(i)}
                    onPointerMove={onPinMove(i)}
                    onPointerUp={onPinUp(i)}
                    onPointerCancel={onPinUp(i)}
                  />
                )}
                {/* count: 縦線の真下、ボトムブロックと相対日付軸の間に */}
                <text x={cx} y={chartHeight - BOTTOM_AXIS_H + 12} textAnchor="middle"
                  fontSize={10} fontWeight={700} fill={MS_COLOR}
                  className="pointer-events-none select-none">
                  {ms.count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
