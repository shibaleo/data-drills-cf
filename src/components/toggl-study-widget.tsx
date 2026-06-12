"use client";

import { useMemo } from "react";
import { useTogglEntries } from "@/hooks/queries/use-toggl";
import { todayJST } from "@/lib/date-utils";

/**
 * Toggl 勉強時間 (personal_category="Education") ウィジェット。
 *
 * 直近 7 日の study 時間を棒で可視化 + 今日 / 週合計 / 1 日平均をテキスト表示。
 * Plan view に置いて「毎日 drills を見るときに Toggl も視界に入る」を実現する
 * (CLAUDE.md Pending Development #1)。
 */
function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmt(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

const DAYS = 7;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJSTDate(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function TogglStudyWidget() {
  const today = todayJST();
  const from = addDays(today, -(DAYS - 1));
  const { data: entries = [], isLoading } = useTogglEntries(from, today, "Education");

  // 日付ごとの分数集計
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) map.set(addDays(from, i), 0);
    for (const e of entries) {
      if (e.duration_seconds == null || e.duration_seconds <= 0) continue;
      const d = toJSTDate(e.started_at);
      if (!map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + e.duration_seconds / 60);
    }
    return map;
  }, [entries, from]);

  const days = useMemo(() => Array.from(byDate.entries()).map(([date, min]) => ({ date, min })), [byDate]);
  const todayMin = byDate.get(today) ?? 0;
  const weekTotal = days.reduce((acc, d) => acc + d.min, 0);
  const weekAvg = weekTotal / DAYS;
  const peak = Math.max(60, ...days.map((d) => d.min));

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card/50">
      <div className="flex flex-col gap-0.5 min-w-[88px]">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Study (Toggl)</span>
        <span className="text-base font-semibold tabular-nums">
          {isLoading ? "—" : fmt(todayMin)}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">today</span>
        </span>
      </div>

      {/* 7日 sparkbar */}
      <div className="flex items-end gap-[3px] h-7" aria-label="last 7 days">
        {days.map(({ date, min }) => {
          const h = peak > 0 ? Math.max(2, (min / peak) * 28) : 2;
          const isToday = date === today;
          return (
            <div
              key={date}
              title={`${date.slice(5)}: ${fmt(min)}`}
              className={`w-[6px] rounded-sm ${isToday ? "bg-primary" : "bg-foreground/35"}`}
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground tabular-nums">
        <span>7d total <span className="text-foreground font-medium">{fmt(weekTotal)}</span></span>
        <span>7d avg <span className="text-foreground font-medium">{fmt(weekAvg)}</span></span>
      </div>
    </div>
  );
}
