/**
 * Time-bottleneck list — 累計時間が多いのに進んでいない問題を炙り出す。
 *
 * 行動: 上位の Miss/Rough をクリックして問題を開き、
 *   - 教材に戻る
 *   - 飛ばす判断をする
 *   - 解説を精読する / 講師に質問する
 * など、闇雲な復習を止める判断材料にする。
 */
import { useMemo, useState } from "react";
import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";
import { OpaqueTag } from "@/components/problem-card";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Props = {
  problems: ProblemWithAnswers[];
  statuses: Status[];
  /** クリックで problem detail を開く */
  onOpenProblem?: (problemId: string) => void;
  /** 表示行数 (default 10) */
  topN?: number;
};

type Row = {
  problemId: string;
  code: string;
  name: string;
  attempts: number;
  totalDurationSec: number;
  latestStatus: string | null;
  latestStatusColor: string | null;
  daysSinceFirst: number | null;
  isStillMissOrRough: boolean;
};

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function TimeBottleneckList({ problems, statuses, onOpenProblem, topN = 10 }: Props) {
  const [showAll, setShowAll] = useState(false);

  const statusByName = useMemo(() =>
    new Map(statuses.map((s) => [s.name, s])), [statuses]);
  const sortedStatuses = useMemo(() =>
    [...statuses].sort((a, b) => a.sortOrder - b.sortOrder), [statuses]);
  const lowStatusNames = useMemo(() => {
    // 下位 40% = Miss/Rough 相当
    const cutoff = Math.max(1, Math.floor(sortedStatuses.length * 0.4));
    return new Set(sortedStatuses.slice(0, cutoff).map((s) => s.name));
  }, [sortedStatuses]);

  const rows = useMemo<Row[]>(() => {
    const today = new Date().getTime();
    const r: Row[] = problems
      .filter((p) => p.answers.length > 0)
      .map((p) => {
        const totalDur = p.answers.reduce((s, a) => s + (a.duration_sec ?? 0), 0);
        const latest = p.answers[p.answers.length - 1];
        const first = p.answers[0];
        const firstDateMs = new Date(`${first.date}T00:00:00Z`).getTime();
        const daysSinceFirst = Math.round((today - firstDateMs) / 86_400_000);
        const latestStatus = latest.status ?? null;
        const latestStatusColor = latestStatus
          ? statusByName.get(latestStatus)?.color ?? null
          : null;
        return {
          problemId: p.id,
          code: p.code,
          name: p.name,
          attempts: p.answers.length,
          totalDurationSec: totalDur,
          latestStatus,
          latestStatusColor,
          daysSinceFirst,
          isStillMissOrRough: latestStatus ? lowStatusNames.has(latestStatus) : false,
        };
      })
      .sort((a, b) => b.totalDurationSec - a.totalDurationSec);
    return r;
  }, [problems, statusByName, lowStatusNames]);

  const visible = showAll ? rows.slice(0, topN * 3) : rows.slice(0, topN);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Time bottleneck (累計時間 top {visible.length})</div>
        {rows.length > topN && (
          <button type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground">
            {showAll ? "Show top 10" : `Show ${Math.min(rows.length, topN * 3)}`}
          </button>
        )}
      </div>
      <table className="text-xs w-full">
        <thead>
          <tr className="text-[10px] text-muted-foreground border-b">
            <th className="text-left font-medium pr-2 py-1">#</th>
            <th className="text-left font-medium pr-2 py-1">Code · Name</th>
            <th className="text-right font-medium px-2 py-1 w-16">Time</th>
            <th className="text-right font-medium px-2 py-1 w-12">×</th>
            <th className="text-center font-medium px-2 py-1 w-20">Status</th>
            <th className="text-right font-medium pl-2 py-1 w-14">経過</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={row.problemId}
              className={`border-t hover:bg-accent cursor-pointer ${row.isStillMissOrRough ? "" : "text-muted-foreground"}`}
              onClick={() => onOpenProblem?.(row.problemId)}>
              <td className="pr-2 py-1 text-[10px] text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="pr-2 py-1">
                <span className="font-mono text-[11px] mr-1.5">{row.code}</span>
                <span className="text-[11px]">{row.name}</span>
              </td>
              <td className="text-right px-2 py-1 tabular-nums text-[11px] font-semibold">
                {fmtDuration(row.totalDurationSec)}
              </td>
              <td className="text-right px-2 py-1 tabular-nums text-[11px]">{row.attempts}</td>
              <td className="text-center px-2 py-1">
                {row.latestStatus && (
                  <OpaqueTag name={row.latestStatus} color={row.latestStatusColor}/>
                )}
              </td>
              <td className="text-right pl-2 py-1 tabular-nums text-[11px] text-muted-foreground">
                {row.daysSinceFirst != null ? `${row.daysSinceFirst}d` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-muted-foreground">
        Miss/Rough のまま時間が嵩んでいる問題 = 闇雲な復習を止め、教材戻り / 解説精読 / 飛ばす判断を
      </div>
    </div>
  );
}
