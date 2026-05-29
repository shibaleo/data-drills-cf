/**
 * Cycle time stats — First attempt → Done に達するまでの日数 / attempts 分布。
 *
 * 行動:
 *  - 「Done まで平均どれくらいか」が見えると未着手問題の完了見込みが計算できる
 *  - backlog の milestone date 設定の calibration になる
 *  - 分布が広い場合 (外れ値) は対処が要る問題を炙り出す
 */
import { useMemo } from "react";
import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Props = {
  problems: ProblemWithAnswers[];
  statuses: Status[];
};

type Sample = { days: number; attempts: number; problemId: string };

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function CycleTimeStats({ problems, statuses }: Props) {
  // "Done" status = sortOrder 最大
  const doneStatus = useMemo(() => {
    if (statuses.length === 0) return null;
    return [...statuses].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  }, [statuses]);

  const samples = useMemo<Sample[]>(() => {
    if (!doneStatus) return [];
    const out: Sample[] = [];
    for (const p of problems) {
      if (p.answers.length === 0) continue;
      const doneIdx = p.answers.findIndex((a) => a.status === doneStatus.name);
      if (doneIdx < 0) continue;
      const first = p.answers[0];
      const done = p.answers[doneIdx];
      const days = Math.max(0, Math.round(
        (new Date(`${done.date}T00:00:00Z`).getTime() - new Date(`${first.date}T00:00:00Z`).getTime())
        / 86_400_000,
      ));
      out.push({ days, attempts: doneIdx + 1, problemId: p.id });
    }
    return out;
  }, [problems, doneStatus]);

  // 未到達 (= Done に達してない) 件数も把握
  const inflight = useMemo(() => {
    if (!doneStatus) return 0;
    let n = 0;
    for (const p of problems) {
      if (p.answers.length === 0) continue;
      if (!p.answers.some((a) => a.status === doneStatus.name)) n++;
    }
    return n;
  }, [problems, doneStatus]);

  if (!doneStatus) return null;

  if (samples.length === 0) {
    return (
      <div className="rounded-md border p-3 space-y-1">
        <div className="text-xs font-semibold">Cycle time (First → {doneStatus.name})</div>
        <div className="text-[11px] text-muted-foreground">
          まだ {doneStatus.name} に到達した問題がありません。Done 達成後に集計されます。
          {inflight > 0 && <> (進行中: {inflight} 問)</>}
        </div>
      </div>
    );
  }

  const daysArr = samples.map((s) => s.days);
  const attemptsArr = samples.map((s) => s.attempts);
  const stats = {
    median: percentile(daysArr, 0.5),
    p25: percentile(daysArr, 0.25),
    p75: percentile(daysArr, 0.75),
    min: Math.min(...daysArr),
    max: Math.max(...daysArr),
    medAttempts: percentile(attemptsArr, 0.5),
    p25Attempts: percentile(attemptsArr, 0.25),
    p75Attempts: percentile(attemptsArr, 0.75),
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Cycle time (First → {doneStatus.name})</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {samples.length} 完了 / {inflight} 進行中
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="所要日数 (median)"
          value={`${stats.median} d`}
          range={`${stats.p25}–${stats.p75} d (IQR)`}
          extremes={`min ${stats.min} / max ${stats.max}`} />
        <Stat label="所要 attempts (median)"
          value={`${stats.medAttempts} 回`}
          range={`${stats.p25Attempts}–${stats.p75Attempts} 回 (IQR)`} />
      </div>
      <Histogram values={daysArr} unitLabel="d" />
      <div className="text-[10px] text-muted-foreground">
        未着手問題の見込み完了 = (残数 × 中央値) を milestone 設計の目安に
      </div>
    </div>
  );
}

function Stat({ label, value, range, extremes }: {
  label: string;
  value: string;
  range: string;
  extremes?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums">{range}</div>
      {extremes && <div className="text-[9px] text-muted-foreground tabular-nums">{extremes}</div>}
    </div>
  );
}

function Histogram({ values, unitLabel }: { values: number[]; unitLabel: string }) {
  // simple log-ish bucketing: 0-7, 8-14, 15-30, 31-60, 61-90, 91+
  const buckets = [
    { min: 0, max: 7, label: "≤1w" },
    { min: 8, max: 14, label: "2w" },
    { min: 15, max: 30, label: "1m" },
    { min: 31, max: 60, label: "2m" },
    { min: 61, max: 90, label: "3m" },
    { min: 91, max: Infinity, label: "3m+" },
  ];
  const counts = buckets.map((b) => values.filter((v) => v >= b.min && v <= b.max).length);
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-1 h-12 pt-1">
      {buckets.map((b, i) => {
        const h = Math.round((counts[i] / max) * 100);
        return (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="text-[9px] tabular-nums text-muted-foreground leading-none">{counts[i]}</div>
            <div className="w-full bg-primary/40 rounded-sm transition-all"
              style={{ height: `${h}%` }}/>
            <div className="text-[9px] text-muted-foreground leading-none">{b.label}{unitLabel === "d" ? "" : unitLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
