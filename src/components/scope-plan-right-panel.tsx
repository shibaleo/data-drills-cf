"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * BacklogChart の rightPanelExtra にはめ込む scope 設定パネル。
 * daily_minutes / time_multiplier / weekday_weights / deadline ラベルをまとめて表示。
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
        <div className="space-y-0.5">
          {(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const).map((d, idxInUi) => {
            const i = (idxInUi + 1) % 7;
            const dayColor = i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground";
            const mins = Math.round(weekdayWeights[i] * dailyMinutes);
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={`text-[10px] font-medium w-7 text-center ${dayColor}`}>{d}</div>
                <Input type="number" min={0} step={0.1} value={weekdayWeights[i]} disabled={readOnly}
                  onChange={(e) => {
                    const v = Math.max(0, parseFloat(e.target.value) || 0);
                    setWeekdayWeights((prev) => prev.map((w, idx) => idx === i ? v : w));
                  }}
                  className="h-6 flex-1 px-1 text-center text-[10px] tabular-nums"/>
                <span className="text-[9px] tabular-nums text-muted-foreground w-10 text-right">{mins} m</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
