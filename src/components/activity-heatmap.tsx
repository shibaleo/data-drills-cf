/**
 * Activity heatmap — 日別 attempts 数を GitHub 風カレンダーで描画。
 * 連続性 / サボった週 / 集中期 が一目。
 *
 * - 過去 N 日 (default 90) を週 (7行) × 列で並べる
 * - セル濃淡 = その日の attempts 数 (log scale)
 * - 上に 現在ストリーク / 最長 / 総日数 を表示
 */
import { useMemo } from "react";
import type { AnswerHistoryRow } from "@/hooks/queries/use-answer-history";

type Props = {
  rows: AnswerHistoryRow[];
  /** 表示日数 (default 90) */
  days?: number;
};

function dateAddDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ActivityHeatmap({ rows, days = 90 }: Props) {
  const { dates, countByDate, today } = useMemo(() => {
    const today = todayISO();
    const start = dateAddDays(today, -(days - 1));
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
    }
    const ds: string[] = [];
    for (let i = 0; i < days; i++) {
      ds.push(dateAddDays(start, i));
    }
    return { dates: ds, countByDate: counts, today };
  }, [rows, days]);

  // 統計: 連続日数 / 最長 / 総日数
  const { currentStreak, longestStreak, activeDays } = useMemo(() => {
    let current = 0;
    let longest = 0;
    let active = 0;
    // 今日から逆順に見て連続日を数える
    let cursor = today;
    while (true) {
      const c = countByDate.get(cursor) ?? 0;
      if (c === 0) break;
      current++;
      cursor = dateAddDays(cursor, -1);
    }
    // longest: 全期間で
    let run = 0;
    for (const d of dates) {
      const c = countByDate.get(d) ?? 0;
      if (c > 0) {
        run++;
        active++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
    }
    return { currentStreak: current, longestStreak: longest, activeDays: active };
  }, [dates, countByDate, today]);

  // 列 (週) × 行 (曜日 0=Sun..6=Sat) のグリッド配置
  // 各日の曜日を取得
  const grid = useMemo(() => {
    // 列の数 = days / 7 切り上げ
    type Cell = { date: string; count: number; dow: number; isFuture: boolean };
    const cells: Cell[] = dates.map((d) => {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      return {
        date: d,
        count: countByDate.get(d) ?? 0,
        dow,
        isFuture: d > today,
      };
    });
    // 最初の week は前の方の空白で埋める
    const firstDow = cells[0]?.dow ?? 0;
    const padded: (Cell | null)[] = [];
    for (let i = 0; i < firstDow; i++) padded.push(null);
    padded.push(...cells);
    // 7 列ずつ
    const weeks: (Cell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }
    return weeks;
  }, [dates, countByDate, today]);

  // 強度 → 色 (log scale)
  const maxCount = Math.max(1, ...Array.from(countByDate.values()));
  const intensity = (c: number): number => {
    if (c === 0) return 0;
    return Math.min(1, Math.log(c + 1) / Math.log(maxCount + 1));
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Activity ({days}d)</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{currentStreak}</span> streak ·
          max {longestStreak}d · active {activeDays} / {days}d
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex gap-[2px]" style={{ minWidth: "100%" }}>
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((cell, ci) => {
                if (!cell) return <div key={ci} className="size-3"/>;
                const i = intensity(cell.count);
                const bg = cell.isFuture
                  ? "transparent"
                  : i === 0
                    ? "hsl(var(--muted))"
                    : `color-mix(in srgb, hsl(var(--card)) ${100 - Math.round(i * 80)}%, hsl(var(--primary)))`;
                return (
                  <div key={ci}
                    title={`${cell.date}: ${cell.count} answer${cell.count === 1 ? "" : "s"}`}
                    className={`size-3 rounded-[2px] ${cell.isFuture ? "" : "cursor-default"}`}
                    style={{ backgroundColor: bg }}/>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div key={i} className="size-3 rounded-[2px]"
            style={{ backgroundColor: v === 0 ? "hsl(var(--muted))" : `color-mix(in srgb, hsl(var(--card)) ${100 - Math.round(v * 80)}%, hsl(var(--primary)))` }}/>
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
