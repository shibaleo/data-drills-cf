"use client";

import { useCallback, useRef } from "react";

/**
 * 復習間隔の可視化スライダー。各 status を thumb として timeline 上で drag できる。
 * 使う側で base (= 既定値) と override (= 現在値) を渡し、onChange で preview 反映。
 * 保存タイミングは呼び出し側が制御。
 */
export function StabilitySlider({
  statuses,
  overrides,
  onChange,
  max,
}: {
  statuses: { id: string; name: string; color: string | null; stabilityDays: number }[];
  /** override 値 (status id → days)。未設定は base stabilityDays を表示。 */
  overrides: Map<string, number>;
  onChange: (id: string, v: number) => void;
  max: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);

  const pctToVal = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * max);
    },
    [max],
  );

  const startDrag = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = id;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(id, pctToVal(e.clientX));
  };

  const moveDrag = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== id) return;
    onChange(id, pctToVal(e.clientX));
  };

  const endDrag = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current === id) draggingRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const tickStep = max <= 30 ? 5 : max <= 90 ? 15 : max <= 200 ? 30 : 60;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += tickStep) ticks.push(v);

  return (
    <div ref={trackRef} className="relative h-14 select-none touch-none">
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border rounded" />
      {ticks.map((v) => {
        const pct = (v / max) * 100;
        return (
          <div key={`tick-${v}`} className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pct}%` }}>
            <div className="w-px h-2 -mt-1 mx-auto bg-muted-foreground/40" />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
              {v}d
            </div>
          </div>
        );
      })}
      {statuses.map((s) => {
        const v = overrides.get(s.id) ?? s.stabilityDays;
        const pct = Math.min(100, Math.max(0, (v / max) * 100));
        const color = s.color ?? "#888";
        return (
          <div
            key={s.id}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full border-2 border-background cursor-grab active:cursor-grabbing"
            style={{ left: `${pct}%`, backgroundColor: color, boxShadow: "0 0 0 1px hsl(var(--border))" }}
            onPointerDown={startDrag(s.id)}
            onPointerMove={moveDrag(s.id)}
            onPointerUp={endDrag(s.id)}
            onPointerCancel={endDrag(s.id)}
          >
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] tabular-nums font-medium whitespace-nowrap"
              style={{ color }}
            >
              {v}d
            </div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
