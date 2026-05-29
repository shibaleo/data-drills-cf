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
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
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
  const didInitScrollRef = useRef(false);

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

  // 初回 mount: cursor を 1/3 位置にスクロール。
  // clientWidth が 0 のタイミング (= 初回 paint 前) を避けるため rAF で待つ。
  useEffect(() => {
    if (!scrollRef.current || cursorIdx < 0 || didInitScrollRef.current) return;
    const tryScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.clientWidth === 0) {
        // 次フレームに再試行
        requestAnimationFrame(tryScroll);
        return;
      }
      didInitScrollRef.current = true;
      const cursorX = cursorIdx * STEP;
      el.scrollLeft = Math.max(0, cursorX - el.clientWidth / 3);
    };
    requestAnimationFrame(tryScroll);
  }, [cursorIdx]);

  return (
    <div className="flex">
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
        <svg width={chartWidth} height={chartHeight} className="block"
          onPointerDown={(e) => {
            if (!onCursorDrag) return;
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const cursorX = cursorIdx * STEP + CELL / 2;
            if (Math.abs(x - cursorX) > 8) return;
            e.preventDefault();
            svg.setPointerCapture(e.pointerId);
            svg.style.cursor = "grabbing";
            const move = (ev: PointerEvent) => {
              const px = ev.clientX - rect.left;
              const idx = Math.round((px - CELL / 2) / STEP);
              const clamped = Math.max(0, Math.min(dates.length - 1, idx));
              onCursorDrag(dates[clamped]);
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
          {/* cursor line */}
          {cursorIdx >= 0 && (
            <>
              <line x1={cursorIdx * STEP + CELL / 2} y1={topAxisH}
                x2={cursorIdx * STEP + CELL / 2} y2={chartHeight - bottomAxisH}
                stroke="hsl(var(--foreground))" strokeWidth={1.5}
                strokeDasharray="4 3" opacity={0.7}/>
              {onCursorDrag && (
                <line x1={cursorIdx * STEP + CELL / 2} y1={topAxisH}
                  x2={cursorIdx * STEP + CELL / 2} y2={chartHeight - bottomAxisH}
                  stroke="transparent" strokeWidth={14} style={{ cursor: "grab" }}/>
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
