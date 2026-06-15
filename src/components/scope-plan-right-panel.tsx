"use client";

import { useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * TetrisChart の rightPanelExtra にはめ込む scope 設定パネル。
 * daily_minutes / time_multiplier / weekday_weights / deadline ラベルをまとめて表示。
 *
 * Weekday は SMTWTFS 並びの縦スライダ 7 本。max=1 で固定して高さを安定化。
 * 値テキストをクリックすると数値入力に切り替わる。
 */
export function ScopePlanRightPanel({
  dailyMinutes, setDailyMinutes,
  timeMultiplier, setTimeMultiplier,
  weekdayWeights, setWeekdayWeights,
  deadlineDate, daysToDeadline,
  readOnly,
}: {
  dailyMinutes: number;
  setDailyMinutes: (v: number) => void;
  timeMultiplier: number;
  setTimeMultiplier: (v: number) => void;
  weekdayWeights: number[];
  setWeekdayWeights: (updater: (prev: number[]) => number[]) => void;
  deadlineDate?: string | null;
  daysToDeadline?: number | null;
  readOnly?: boolean;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // SMTWTFS 並び。weekdayWeights は [Sun, Mon, Tue, ..., Sat] (i=0..6) 想定。
  const days: { label: string; i: number; color: string }[] = [
    { label: "S", i: 0, color: "text-red-500" },
    { label: "M", i: 1, color: "text-muted-foreground" },
    { label: "T", i: 2, color: "text-muted-foreground" },
    { label: "W", i: 3, color: "text-muted-foreground" },
    { label: "T", i: 4, color: "text-muted-foreground" },
    { label: "F", i: 5, color: "text-muted-foreground" },
    { label: "S", i: 6, color: "text-blue-500" },
  ];
  const commit = useCallback((i: number, v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setWeekdayWeights((prev) => prev.map((w, idx) => idx === i ? clamped : w));
  }, [setWeekdayWeights]);

  return (
    <div className="space-y-3 text-xs" style={{ width: 200 }}>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Max (min)</Label>
          <Input type="number" min={1} value={dailyMinutes} disabled={readOnly}
            onChange={(e) => setDailyMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            className="h-7 text-xs tabular-nums text-center"/>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Mult ×</Label>
          <Input type="number" min={0.1} step={0.1} value={timeMultiplier} disabled={readOnly}
            onChange={(e) => setTimeMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1))}
            className="h-7 text-xs tabular-nums text-center"/>
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t pt-1">
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Weekly</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {Math.round(weekdayWeights.reduce((s, w) => s + w * dailyMinutes, 0))} m
        </span>
      </div>
      {deadlineDate && daysToDeadline != null && (
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Deadline</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {deadlineDate}
            <span className={`ml-1.5 ${daysToDeadline < 30 ? "text-destructive/80" : ""}`}>
              ({daysToDeadline >= 0 ? `D-${daysToDeadline}` : `D+${Math.abs(daysToDeadline)}`})
            </span>
          </span>
        </div>
      )}
      <div>
        <Label className="text-[9px] uppercase tracking-wide text-muted-foreground block mb-1">Rate</Label>
        <div className="flex items-end justify-between gap-1">
          {days.map(({ label, i, color }) => {
            const w = weekdayWeights[i] ?? 0;
            return (
              <div key={`${i}-${label}`} className="flex flex-col items-center gap-1">
                <div className={`text-[10px] font-medium ${color}`}>{label}</div>
                <VerticalSlider value={w} onChange={(v) => commit(i, v)} disabled={readOnly}/>
                {editingIdx === i ? (
                  <input type="text" inputMode="decimal" autoFocus
                    defaultValue={w.toFixed(2)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) commit(i, n);
                      setEditingIdx(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ width: "4ch" }}
                    className="text-center text-[9px] tabular-nums p-0 rounded-sm bg-transparent outline-none border-0 ring-1 ring-primary/50 focus:ring-primary"/>
                ) : (
                  <button type="button" disabled={readOnly}
                    onClick={() => setEditingIdx(i)}
                    style={{ width: "4ch" }}
                    className="text-center text-[9px] tabular-nums text-muted-foreground hover:text-foreground disabled:opacity-50">
                    {w.toFixed(2)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VerticalSlider({ value, onChange, disabled, height = 60, width = 12 }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
  height?: number; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useCallback((clientY: number) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = 1 - (clientY - rect.top) / rect.height;
    const stepped = Math.round(Math.max(0, Math.min(1, ratio)) * 20) / 20;  // step 0.05
    onChange(stepped);
  }, [onChange]);
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    handle(e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    if (disabled) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    handle(e.clientY);
  };
  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onMove}
      className={`relative rounded-full bg-muted touch-none select-none ${disabled ? "opacity-50" : "cursor-ns-resize"}`}
      style={{ width, height }}>
      <div className="absolute bottom-0 left-0 right-0 rounded-full bg-primary/70"
        style={{ height: `${value * 100}%` }}/>
    </div>
  );
}
