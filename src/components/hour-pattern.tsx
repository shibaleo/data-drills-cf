/**
 * Hour-of-day pattern — JST 時刻別の平均所要時間 (median duration)。
 *
 * 「いつ頭が冴えるか」を測る。Miss 率と違い、解いた問題の難易度に依らず
 * 認知パフォーマンスを直接反映する (selection bias 少)。
 *
 * 短い bar = 速い = 冴えている。難しい問題は冴えてる時間帯に。
 */
import { useMemo } from "react";
import type { AnswerHistoryRow } from "@/hooks/queries/use-answer-history";

type Props = {
  rows: AnswerHistoryRow[];
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_SAMPLES = 5;

function jstHour(createdAtIso: string): number {
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return 0;
  const jst = new Date(t + JST_OFFSET_MS);
  return jst.getUTCHours();
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 10 && s > 0) return `${m}m${s}s`;
  return `${m}m`;
}

export function HourPattern({ rows }: Props) {
  const buckets = useMemo(() => {
    // 2時間 × 12 バケット
    const periods: { label: string; from: number; to: number; durations: number[] }[] = [];
    for (let h = 0; h < 24; h += 2) {
      periods.push({ label: `${h}`, from: h, to: h + 1, durations: [] });
    }
    for (const r of rows) {
      if (r.duration == null || r.duration <= 0) continue;
      const h = jstHour(r.createdAt);
      const period = periods.find((p) => h >= p.from && h <= p.to);
      if (period) period.durations.push(r.duration);
    }
    return periods.map((p) => ({
      label: p.label,
      from: p.from,
      to: p.to,
      total: p.durations.length,
      medianSec: median(p.durations),
    }));
  }, [rows]);

  const significantBuckets = buckets.filter((b) => b.total >= MIN_SAMPLES);
  if (significantBuckets.length === 0) {
    return (
      <div className="rounded-md border p-3 space-y-1">
        <div className="text-xs font-semibold">Hour pattern (median duration, JST)</div>
        <div className="text-[11px] text-muted-foreground">
          duration を含む answer が不足 (各 bucket n &lt; {MIN_SAMPLES})
        </div>
      </div>
    );
  }

  // 全体の最大/最小 (= bar 高さ正規化、低サンプル除く)
  const maxMedian = Math.max(...significantBuckets.map((b) => b.medianSec));
  const fastest = significantBuckets.reduce((a, b) => b.medianSec < a.medianSec ? b : a);
  const slowest = significantBuckets.reduce((a, b) => b.medianSec > a.medianSec ? b : a);

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-xs font-semibold">Hour pattern (median duration, JST, 2h bucket)</div>
      <div className="grid grid-cols-12 gap-1">
        {buckets.map((b) => {
          const lowSample = b.total < MIN_SAMPLES;
          const heightPct = b.medianSec > 0 ? Math.round((b.medianSec / maxMedian) * 100) : 0;
          const isFastest = !lowSample && b === fastest;
          const isSlowest = !lowSample && b === slowest;
          // 速い ほど良い = primary 色、遅いほど destructive
          const color = isFastest
            ? "hsl(var(--primary))"
            : isSlowest
              ? "hsl(var(--destructive))"
              : "color-mix(in srgb, hsl(var(--card)) 50%, hsl(var(--muted-foreground)))";
          return (
            <div key={b.label}
              className={`flex flex-col items-center gap-0.5 ${lowSample ? "opacity-40" : ""}`}>
              <div className="text-[9px] text-muted-foreground tabular-nums leading-tight h-3">
                {b.total >= MIN_SAMPLES ? fmtSec(b.medianSec) : ""}
              </div>
              <div className="w-full h-12 bg-muted/30 rounded-sm overflow-hidden flex flex-col-reverse">
                {b.medianSec > 0 && (
                  <div className="w-full" style={{ height: `${heightPct}%`, backgroundColor: color }}/>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground tabular-nums leading-none">{b.label}</div>
              <div className="text-[8px] text-muted-foreground/60 tabular-nums leading-none">{b.total}</div>
            </div>
          );
        })}
      </div>
      {fastest.label !== slowest.label && (
        <div className="text-[10px] text-muted-foreground border-t pt-1.5">
          Fastest: <span className="font-semibold text-primary">{fastest.label}-{fastest.from + 2}h</span>
          {" "}({fmtSec(fastest.medianSec)}) ·
          {" "}Slowest: <span className="font-semibold text-destructive">{slowest.label}-{slowest.from + 2}h</span>
          {" "}({fmtSec(slowest.medianSec)}).
          {" "}Tackle hard problems around {fastest.label}h
        </div>
      )}
    </div>
  );
}
