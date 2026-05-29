/**
 * Hour-of-day pattern — JST 時刻別の attempts 数 + Miss 率。
 * 「朝にやる方が成績良い / 夜は劣化」のような時間帯クセを可視化。
 *
 * 行動: 最強の時間帯に難しい問題を回す習慣設計。
 */
import { useMemo } from "react";
import type { ThroughputRow } from "@/hooks/queries/use-throughput";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Props = {
  rows: ThroughputRow[];
  statuses: Status[];
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 時刻文字列 → JST hour (0-23) */
function jstHour(createdAtIso: string): number {
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return 0;
  const jst = new Date(t + JST_OFFSET_MS);
  return jst.getUTCHours();
}

export function HourPattern({ rows, statuses }: Props) {
  // 最も "悪い" status を Miss 相当として識別 (sortOrder 0)
  const missStatus = useMemo(() => {
    if (statuses.length === 0) return null;
    return [...statuses].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  }, [statuses]);

  const buckets = useMemo(() => {
    // 0-5, 6-11, 12-17, 18-23
    const periods = [
      { label: "0-6", from: 0, to: 5 },
      { label: "6-12", from: 6, to: 11 },
      { label: "12-18", from: 12, to: 17 },
      { label: "18-24", from: 18, to: 23 },
    ];
    return periods.map((p) => {
      let total = 0;
      let miss = 0;
      for (const r of rows) {
        const h = jstHour(r.createdAt);
        if (h < p.from || h > p.to) continue;
        total++;
        if (r.statusName === missStatus?.name) miss++;
      }
      const missRate = total > 0 ? miss / total : 0;
      return { ...p, total, miss, missRate };
    });
  }, [rows, missStatus]);

  if (!missStatus) return null;

  const maxCount = Math.max(1, ...buckets.map((b) => b.total));

  // 最良時間帯 (最も Miss 率が低く、母数が一定以上)
  const significantBuckets = buckets.filter((b) => b.total >= 5);
  const bestBucket = significantBuckets.length > 0
    ? significantBuckets.reduce((best, b) => b.missRate < best.missRate ? b : best)
    : null;
  const worstBucket = significantBuckets.length > 0
    ? significantBuckets.reduce((worst, b) => b.missRate > worst.missRate ? b : worst)
    : null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-xs font-semibold">Hour pattern ({missStatus.name} 率, JST)</div>
      <div className="grid grid-cols-4 gap-2">
        {buckets.map((b) => {
          const heightPct = Math.round((b.total / maxCount) * 100);
          const missColor = missStatus.color ?? "#ef4444";
          return (
            <div key={b.label} className="flex flex-col items-center gap-1">
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {b.total > 0 ? `${Math.round(b.missRate * 100)}%` : "—"}
              </div>
              <div className="w-full h-16 bg-muted/30 rounded-sm overflow-hidden flex flex-col-reverse">
                {b.total > 0 && (
                  <>
                    <div className="w-full"
                      style={{
                        height: `${heightPct * (1 - b.missRate)}%`,
                        backgroundColor: "color-mix(in srgb, hsl(var(--card)) 60%, hsl(var(--primary)))",
                      }}/>
                    <div className="w-full"
                      style={{
                        height: `${heightPct * b.missRate}%`,
                        backgroundColor: missColor,
                      }}/>
                  </>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{b.label}</div>
              <div className="text-[9px] text-muted-foreground/60 tabular-nums">n={b.total}</div>
            </div>
          );
        })}
      </div>
      {bestBucket && worstBucket && bestBucket.label !== worstBucket.label && (
        <div className="text-[10px] text-muted-foreground border-t pt-1.5">
          <span className="font-semibold text-foreground">{bestBucket.label}時</span>
          {" "}が最も {missStatus.name} 率低 ({Math.round(bestBucket.missRate * 100)}%) ·
          {" "}<span className="font-semibold">{worstBucket.label}時</span>
          {" "}は高 ({Math.round(worstBucket.missRate * 100)}%)。
          難しい問題は{bestBucket.label}時帯に
        </div>
      )}
    </div>
  );
}
