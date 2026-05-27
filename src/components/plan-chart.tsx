/**
 * Plan 用 Tetris チャート。
 * milestone 縦線にドラッグハンドルを付けて、線そのものを動かして日付を変更できる。
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  onOpen,
  onMilestoneDateChange,
  onMilestoneCountChange,
  onMilestoneNameChange,
  onMilestoneAddChild,
  onMilestoneRemove,
  showMilestonePins,
  milestoneAnchors,
}: {
  items: AllocatedProblem[];
  milestones: Milestone[];
  today: string;
  selectedId?: string | null;
  onSelect?: (problemId: string) => void;
  onOpen?: (problemId: string) => void;
  /** milestone のドラッグハンドルを動かした時のコールバック。index は milestones 配列のインデックス。 */
  onMilestoneDateChange?: (index: number, newDate: string) => void;
  onMilestoneCountChange?: (index: number, newCount: number) => void;
  onMilestoneNameChange?: (index: number, newName: string) => void;
  onMilestoneAddChild?: (index: number) => void;
  onMilestoneRemove?: (index: number) => void;
  /** milestone ピン (count ラベル + 円ハンドル) を描画するか。false の時も縦線と横トラック線は出す。 */
  showMilestonePins?: boolean;
  /** 各 milestone の「実際に N 問目に相当する problem」をハイライトするためのアンカー */
  milestoneAnchors?: { count: number; problemId: string | null }[];
}) {
  const _showPins = showMilestonePins ?? true;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<number | null>(null);
  // pin の右クリックメニュー
  const [menu, setMenu] = useState<{ index: number; x: number; y: number; mode: "menu" | "date" | "count" } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

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

  const MIN_ROWS = 10;
  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);

  // milestones を「トラック」に分割: 同じ parent_id を共有する milestone は同じトラック (= 同じ y) に配置する。
  // トラックの順序は、root → 各 root の子 (深さ優先) で決定。
  type TrackRow = {
    parentId: string | null;
    depth: number;
    /** どの parent milestone の origIndex に対応するか (root なら null) */
    parentOrigIndex: number | null;
    members: { origIndex: number; m: Milestone }[];
  };
  const { tracks, trackIndexByOrigIndex } = useMemo(() => {
    const byParent = new Map<string | null, { origIndex: number; m: Milestone }[]>();
    milestones.forEach((m, origIndex) => {
      const pid = m.parent_id ?? null;
      const list = byParent.get(pid) ?? [];
      list.push({ origIndex, m });
      byParent.set(pid, list);
    });
    const orderedTracks: TrackRow[] = [];
    const indexMap = new Map<number, number>();
    function walk(parentId: string | null, parentOrigIndex: number | null, depth: number) {
      const ms = byParent.get(parentId);
      if (!ms || ms.length === 0) return;
      const sorted = ms.slice().sort((a, b) => a.m.date.localeCompare(b.m.date));
      const trackIdx = orderedTracks.length;
      orderedTracks.push({ parentId, parentOrigIndex, depth, members: sorted });
      for (const e of sorted) indexMap.set(e.origIndex, trackIdx);
      for (const e of sorted) walk(e.m.id ?? null, e.origIndex, depth + 1);
    }
    walk(null, null, 0);
    // 親が消えた孤立 milestone は末尾に 1 件ずつ track として追加
    for (let i = 0; i < milestones.length; i++) {
      if (!indexMap.has(i)) {
        orderedTracks.push({ parentId: null, parentOrigIndex: null, depth: 0, members: [{ origIndex: i, m: milestones[i] }] });
        indexMap.set(i, orderedTracks.length - 1);
      }
    }
    return { tracks: orderedTracks, trackIndexByOrigIndex: indexMap };
  }, [milestones]);

  const ROW_H = 22;
  const MS_TOP_PAD = 8;
  const MS_AREA_H = _showPins ? tracks.length * ROW_H + MS_TOP_PAD : 0;
  const DATE_AXIS_H = 16;
  const TOP_AXIS_H = MS_AREA_H + DATE_AXIS_H + 4;
  const DATE_AXIS_Y = TOP_AXIS_H - 6;
  const BOTTOM_AXIS_H = 34;
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + TOP_AXIS_H + BOTTOM_AXIS_H;
  const Y_AXIS_W = 28;

  /** milestone origIndex → 中心 y */
  const msYByIndex = new Map<number, number>();
  tracks.forEach((t, trackIdx) => {
    const y = MS_TOP_PAD + trackIdx * ROW_H + ROW_H / 2;
    for (const e of t.members) msYByIndex.set(e.origIndex, y);
  });

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
    // ドラッグ中、ピンがスクロール領域の端に近づいたら自動スクロール
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 60;  // 端から 60px 以内で auto-scroll 発動
    const speed = 16;
    if (e.clientX < rect.left + edge) {
      container.scrollLeft -= speed;
    } else if (e.clientX > rect.right - edge) {
      container.scrollLeft += speed;
    }
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
              stroke="hsl(var(--foreground))" strokeWidth={1.5}
              strokeDasharray="4 3" opacity={0.7}/>
          )}
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
                          {anchor ? `[${anchor.count}問目] ` : ""}
                          {item.code} {item.name ?? ""} ({Math.round(item.standardTimeSec / 60)}分)
                          {item.overBudget ? " ⚠ 1日の枠超" : ""}
                        </title>
                      </rect>
                    </g>
                  );
                })}
                {/* anchor ラベルはスタックの最上段の上に出す (他ブロックに埋もれない) */}
                {(() => {
                  const anchorsHere = dayItems
                    .map((it, idx) => ({ it, idx }))
                    .filter(({ it }) => milestoneAnchors?.some((a) => a.problemId === it.problemId));
                  if (anchorsHere.length === 0) return null;
                  const topY = chartHeight - BOTTOM_AXIS_H - dayItems.length * STEP - 4;
                  return anchorsHere.map(({ it }) => {
                    const a = milestoneAnchors!.find((x) => x.problemId === it.problemId)!;
                    return (
                      <text key={`anchor-${it.problemId}`}
                        x={x + CELL / 2} y={topY} textAnchor="middle"
                        fontSize={10} fontWeight={700} fill={MS_COLOR}
                        className="pointer-events-none select-none">
                        {a.count}
                      </text>
                    );
                  });
                })()}
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
          {/* milestone 横トラック線 (track 単位、同じ parent_id を共有する pin が同じ y に並ぶ) */}
          {_showPins && tracks.map((t, trackIdx) => {
            const y = MS_TOP_PAD + trackIdx * ROW_H + ROW_H / 2;
            const opacity = Math.max(0.2, 0.7 - t.depth * 0.15);
            return (
              <line key={`track-${trackIdx}`}
                x1={t.depth * 8} y1={y} x2={chartWidth} y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={Math.max(1, 2 - t.depth * 0.5)}
                opacity={opacity}
                strokeLinecap="round"/>
            );
          })}
          {/* milestone 縦線 + ピン + count ラベル */}
          {milestones.map((ms, i) => {
            const idx = dates.indexOf(ms.date);
            const colIdx = idx >= 0 ? idx : Math.max(0, Math.round((new Date(`${ms.date}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) / 86400000));
            const cx = colIdx * STEP + CELL / 2;
            const trackIdx = trackIndexByOrigIndex.get(i) ?? 0;
            const depth = tracks[trackIdx]?.depth ?? 0;
            const rowY = msYByIndex.get(i) ?? MS_TOP_PAD;
            const pinR = Math.max(3.6, 8.1 - depth * 1.35);  // 10% small
            const strokeW = Math.max(0.8, 1.5 - depth * 0.3);
            // 縦線は depth に応じて細く / 透明度を下げる
            const vLineOpacity = Math.max(0.2, 0.6 - depth * 0.1);
            const vLineW = Math.max(0.8, 1.5 - depth * 0.3);
            return (
              <g key={`ms-${i}`}>
                <line x1={cx} y1={rowY} x2={cx} y2={chartHeight - BOTTOM_AXIS_H}
                  stroke={MS_COLOR} strokeWidth={vLineW} opacity={vLineOpacity}/>
                {_showPins && (
                  <circle cx={cx} cy={rowY} r={pinR}
                    fill={MS_COLOR}
                    stroke="hsl(var(--background))" strokeWidth={strokeW}
                    className={onMilestoneDateChange ? "cursor-grab active:cursor-grabbing" : ""}
                    onPointerDown={onPinDown(i)}
                    onPointerMove={onPinMove(i)}
                    onPointerUp={onPinUp(i)}
                    onPointerCancel={onPinUp(i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ index: i, x: e.clientX, y: e.clientY, mode: "menu" });
                    }}
                  />
                )}
                {/* count: 縦線の真下、ボトムブロックと相対日付軸の間に */}
                <text x={cx} y={chartHeight - BOTTOM_AXIS_H + 12} textAnchor="middle"
                  fontSize={10 - Math.min(2, depth)} fontWeight={700} fill={MS_COLOR}
                  opacity={vLineOpacity + 0.2}
                  className="pointer-events-none select-none">
                  {ms.count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* 右クリックメニュー (削除・日付指定) */}
      {menu && (
        <div
          className="fixed z-50 rounded-md border bg-popover text-popover-foreground shadow-md p-1 text-xs"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.mode === "menu" && (
            <div className="flex flex-col min-w-[140px]">
              <button type="button"
                className="text-left px-2 py-1 rounded hover:bg-accent"
                onClick={() => setMenu({ ...menu, mode: "count" })}>
                件数指定…
              </button>
              <button type="button"
                className="text-left px-2 py-1 rounded hover:bg-accent"
                onClick={() => setMenu({ ...menu, mode: "date" })}>
                日付指定…
              </button>
              <button type="button"
                className="text-left px-2 py-1 rounded hover:bg-destructive hover:text-destructive-foreground text-destructive"
                onClick={() => {
                  onMilestoneRemove?.(menu.index);
                  setMenu(null);
                }}>
                削除
              </button>
            </div>
          )}
          {menu.mode === "count" && (
            <div className="flex items-center gap-2 p-1">
              <input
                type="number"
                min={0}
                defaultValue={milestones[menu.index]?.count}
                className="h-7 w-20 px-1 text-xs border rounded bg-background tabular-nums"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!Number.isFinite(n) || n < 0) return;
                    onMilestoneCountChange?.(menu.index, n);
                    setMenu(null);
                  }
                }}
              />
              <span className="text-[10px] text-muted-foreground">問 (Enter で確定)</span>
            </div>
          )}
          {menu.mode === "date" && (
            <div className="flex items-center gap-2 p-1">
              <input
                type="date"
                defaultValue={milestones[menu.index]?.date}
                className="h-7 px-1 text-xs border rounded bg-background"
                onChange={(e) => {
                  const newDate = e.target.value;
                  if (!newDate) return;
                  onMilestoneDateChange?.(menu.index, newDate);
                  setMenu(null);
                }}
                autoFocus
              />
            </div>
          )}
        </div>
      )}
      {/* 右側: track 名 + 同じトラックに milestone を追加するアイコン (ピン表示時のみ) */}
      {_showPins && tracks.length > 0 && (
        <div className="shrink-0 pl-2" style={{ width: 180 }}>
          <div style={{ height: MS_TOP_PAD }}/>
          {tracks.map((t, trackIdx) => {
            // 各 track の代表 milestone (= 最初のメンバー) で名前を編集する。
            const lead = t.members[0];
            const label = t.parentId === null ? "ルート" : (t.members[0]?.m.name ?? "");
            return (
              <div key={`track-name-${trackIdx}`}
                className="flex items-center gap-1"
                style={{ height: ROW_H, paddingLeft: t.depth * 10 }}>
                <input
                  type="text"
                  value={lead?.m.name ?? ""}
                  placeholder={t.parentId === null ? "ルート" : "(無題)"}
                  onChange={(e) => lead && onMilestoneNameChange?.(lead.origIndex, e.target.value)}
                  className="flex-1 min-w-0 h-5 px-1 text-[10px] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none"
                  title={label}
                />
                {onMilestoneAddChild && lead && (
                  <button type="button"
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    onClick={() => onMilestoneAddChild(lead.origIndex)}
                    title="このトラックにマイルストーンを追加 (同じ親)">
                    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
