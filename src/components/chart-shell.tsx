/**
 * Common chart shell for Backlog / Review / Throughput tetris charts.
 *
 * Provides:
 *  - Y axis (numeric ticks OR custom HTML left slot)
 *  - Horizontal scroll container
 *  - Main SVG with cursor line (= asOf indicator, defaults to today)
 *  - Draggable cursor (grab cursor)
 *  - Auto scroll-to-cursor on mount
 *  - Optional right HTML slot
 *
 * Block rendering is provided by the consumer via `children` (rendered inside
 * the main SVG, on top of the cursor line so blocks are drawn over the line).
 *
 * Geometry constants (cell size, step, axes heights) follow `chart-constants.ts`.
 * For BacklogChart and the like with rich overlays, just pass complex children.
 */
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { CELL, STEP, Y_AXIS_W } from "@/lib/chart-constants";

export const DEFAULT_TOP_AXIS_H = 16;
export const DEFAULT_BOTTOM_AXIS_H = 20;

export type ChartShellHandle = {
  /** ビュー中心の date (= スクロール位置 + ビュー幅の中央) を取得 */
  getCenterDate: () => string;
  /** ビュー幅の中央が指す date にスクロール */
  scrollToDate: (date: string) => void;
};

export type ChartShellProps = {
  /** 横軸の date 列 (YYYY-MM-DD, 昇順) */
  dates: string[];
  /** cursor 線が指す date (asOf ?? today) */
  cursorDate: string;
  /** 縦の最大セル数 (chart height = maxStack * STEP + axis) */
  maxStack: number;
  /** 上部 axis 領域の高さ。デフォルト 16 */
  topAxisH?: number;
  /** 下部 axis 領域の高さ。デフォルト 20 */
  bottomAxisH?: number;
  /** Y 軸数値ティック (省略するか leftSlot を渡す) */
  yAxisLabels?: number[];
  /** Y 軸の代わりに HTML 要素を左側に置く (BacklogChart の layer rows 用) */
  leftSlot?: React.ReactNode;
  /** 右側 HTML パネル (BacklogChart の params 用) */
  rightSlot?: React.ReactNode;
  /** cursor 線 ドラッグで新 date を返す。未指定なら drag 無効 */
  onCursorDrag?: (newDate: string) => void;
  /** main SVG の中身 (cursor の後ろ、上に重ねて描画される) */
  children?: React.ReactNode;
  /** scrollable コンテナの外側に置く要素 (例: BacklogChart で svg 外の overlay) */
  scrollableExtra?: (geom: { chartWidth: number; chartHeight: number }) => React.ReactNode;
};

export const ChartShell = forwardRef<ChartShellHandle, ChartShellProps>(function ChartShellImpl({
  dates,
  cursorDate,
  maxStack,
  topAxisH = DEFAULT_TOP_AXIS_H,
  bottomAxisH = DEFAULT_BOTTOM_AXIS_H,
  yAxisLabels,
  leftSlot,
  rightSlot,
  onCursorDrag,
  children,
  scrollableExtra,
}: ChartShellProps, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const didInitScrollRef = useRef(false);
  const [ready, setReady] = useState(false);

  const cursorIdx = dates.indexOf(cursorDate);
  const chartWidth = dates.length * STEP;
  const chartHeight = maxStack * STEP + topAxisH + bottomAxisH;

  useImperativeHandle(ref, () => ({
    getCenterDate: () => {
      const container = scrollRef.current;
      if (!container || dates.length === 0) return cursorDate;
      const centerX = container.scrollLeft + container.clientWidth / 2;
      const idx = Math.max(0, Math.min(dates.length - 1, Math.round(centerX / STEP)));
      return dates[idx];
    },
    scrollToDate: (date: string) => {
      const container = scrollRef.current;
      if (!container) return;
      const idx = dates.indexOf(date);
      if (idx < 0) return;
      const targetX = idx * STEP;
      container.scrollLeft = Math.max(0, targetX - container.clientWidth / 2);
    },
  }), [dates, cursorDate]);

  // 初回 mount で cursor を 1/3 位置に scroll。以降はユーザー scroll を尊重して触らないが、
  // データ遅延ロードで dates が大きく拡張され cursor が viewport 外に出た場合は再スクロールする。
  //
  // 注意: 複数 effect 起動で rAF が並走すると stale な cursorIdx で繰り返し scroll
  //       するため、cleanup で前回の rAF をキャンセルする。
  useEffect(() => {
    if (!scrollRef.current || cursorIdx < 0) return;
    if (isDraggingRef.current) return;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const el = scrollRef.current;
      if (!el) return;
      if (el.clientWidth === 0) {
        requestAnimationFrame(tryScroll);
        return;
      }
      const cursorX = cursorIdx * STEP + CELL / 2;
      const inView = cursorX >= el.scrollLeft && cursorX <= el.scrollLeft + el.clientWidth;
      // 初回: dates が確定 (>22) してから 1/3 位置にセット。
      // dates が小さい (= 空 state) なら scroll 不要だが ready は立てて chart を表示する。
      if (!didInitScrollRef.current) {
        if (dates.length <= 22) {
          setReady(true);
          return;
        }
        didInitScrollRef.current = true;
        el.scrollLeft = Math.max(0, cursorX - el.clientWidth / 3);
        setReady(true);
        return;
      }
      // 既に init 済 + cursor が viewport 外 → 1/3 位置に呼び戻す (= データ拡張で cursor が外れた場合)
      if (!inView) {
        el.scrollLeft = Math.max(0, cursorX - el.clientWidth / 3);
      }
    };
    requestAnimationFrame(tryScroll);
    return () => { cancelled = true; };
  }, [cursorIdx, dates.length]);

  return (
    <div className="flex relative" style={{ visibility: ready ? "visible" : "hidden" }}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm"
          style={{ visibility: "visible" }}>
          Loading…
        </div>
      )}
      {/* left: Y axis ticks OR custom HTML slot */}
      {leftSlot ? leftSlot : (
        yAxisLabels && yAxisLabels.length > 0 && (
          <svg width={Y_AXIS_W} height={chartHeight} className="block shrink-0">
            {yAxisLabels.map((n) => (
              <text key={n} x={Y_AXIS_W - 4}
                y={chartHeight - bottomAxisH - n * STEP + CELL / 2}
                textAnchor="end" dominantBaseline="central"
                className="fill-muted-foreground" fontSize={9}>
                {n}
              </text>
            ))}
          </svg>
        )
      )}
      {/* center: scrollable main SVG */}
      <div ref={scrollRef} className="overflow-x-auto pb-2 flex-1 min-w-0 relative">
        <svg width={chartWidth} height={chartHeight} className="block">
          {/* cursor: 視覚線 + ヒット領域。ヒット領域は children より下に置く →
             ブロックが上に被ったセルではブロッククリックが優先される (= カーソル列の
             ブロックも普通にクリック可能)。ブロックがない縦帯ではヒット線がドラッグを受ける。 */}
          {/* 空セルグリッド (装飾、全 column × maxStack 行)。pointer-events 無効で
             カーソルヒット線へのクリックを邪魔しない。 */}
          {dates.map((_, colIdx) => {
            const x = colIdx * STEP;
            return (
              <g key={`grid-${colIdx}`} pointerEvents="none">
                {Array.from({ length: maxStack }, (_, i) => (
                  <rect key={i} x={x}
                    y={chartHeight - bottomAxisH - (i + 1) * STEP}
                    width={CELL} height={CELL} rx={2}
                    fill="none" stroke="hsl(var(--border))" strokeWidth={0.5}/>
                ))}
              </g>
            );
          })}
          {/* カーソル列の縦帯ハイライト (= "今日" 強調)。pointer-events 無効。 */}
          {cursorIdx >= 0 && (
            <rect x={cursorIdx * STEP - 1} y={topAxisH}
              width={CELL + 2} height={maxStack * STEP}
              fill="hsl(var(--foreground))" opacity={0.1}
              pointerEvents="none"/>
          )}
          {cursorIdx >= 0 && (
            <>
              <line x1={cursorIdx * STEP + CELL / 2} y1={topAxisH}
                x2={cursorIdx * STEP + CELL / 2} y2={chartHeight - bottomAxisH}
                stroke="hsl(var(--foreground))" strokeWidth={1.5}
                strokeDasharray="4 3" opacity={0.7}/>
              {onCursorDrag && (
                // ヒット領域: y=0 (= 上端、blocks が無い領域) から下端まで張る。
                // 上半分の axis エリアは常に空なので、そこで widely 掴める。
                // chart body 部分は strokeWidth=10 だが、blocks が SVG の後出しで上に被るので
                // blocks がある列ではブロッククリックが優先される。
                <line x1={cursorIdx * STEP + CELL / 2} y1={0}
                  x2={cursorIdx * STEP + CELL / 2} y2={chartHeight - bottomAxisH}
                  stroke="transparent" strokeWidth={10} style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const rect = svg.getBoundingClientRect();
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    isDraggingRef.current = true;
                    svg.style.cursor = "grabbing";
                    const move = (ev: PointerEvent) => {
                      const px = ev.clientX - rect.left;
                      const idx = Math.round((px - CELL / 2) / STEP);
                      const clamped = Math.max(0, Math.min(dates.length - 1, idx));
                      onCursorDrag(dates[clamped]);
                    };
                    const up = (ev: PointerEvent) => {
                      try { (ev.target as Element).releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
                      svg.style.cursor = "";
                      isDraggingRef.current = false;
                      svg.removeEventListener("pointermove", move);
                      svg.removeEventListener("pointerup", up);
                    };
                    svg.addEventListener("pointermove", move);
                    svg.addEventListener("pointerup", up);
                  }}/>
              )}
            </>
          )}
          {children}
        </svg>
        {scrollableExtra?.({ chartWidth, chartHeight })}
      </div>
      {/* right: optional HTML slot */}
      {rightSlot}
    </div>
  );
});
