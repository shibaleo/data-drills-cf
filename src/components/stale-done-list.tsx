/**
 * Stale Done list — Done 判定後 N 日以上経過した問題。
 *
 * 行動: 試験前の抜き打ち復習対象。本当に長期記憶になっているか確認。
 * クリックで problem detail を開く (= そこで answer を追加できる)。
 */
import { useMemo, useState } from "react";
import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";
import { OpaqueTag } from "@/components/problem-card";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Props = {
  problems: ProblemWithAnswers[];
  statuses: Status[];
  onOpenProblem?: (problemId: string) => void;
};

type Row = {
  problemId: string;
  code: string;
  name: string;
  doneDate: string;
  daysSinceDone: number;
  statusName: string | null;
  statusColor: string | null;
};

const THRESHOLDS = [30, 60, 90, 180] as const;

export function StaleDoneList({ problems, statuses, onOpenProblem }: Props) {
  const [threshold, setThreshold] = useState<number>(60);

  const doneStatus = useMemo(() => {
    if (statuses.length === 0) return null;
    return [...statuses].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  }, [statuses]);

  const rows = useMemo<Row[]>(() => {
    if (!doneStatus) return [];
    const todayMs = Date.now();
    const out: Row[] = [];
    for (const p of problems) {
      if (p.answers.length === 0) continue;
      // 最新 answer が Done なら直近格付。前ではない。
      const latest = p.answers[p.answers.length - 1];
      if (latest.status !== doneStatus.name) continue;
      const daysSinceDone = Math.round(
        (todayMs - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86_400_000,
      );
      if (daysSinceDone < threshold) continue;
      out.push({
        problemId: p.id,
        code: p.code,
        name: p.name,
        doneDate: latest.date,
        daysSinceDone,
        statusName: latest.status,
        statusColor: doneStatus.color ?? null,
      });
    }
    out.sort((a, b) => b.daysSinceDone - a.daysSinceDone);
    return out;
  }, [problems, doneStatus, threshold]);

  if (!doneStatus) return null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Stale {doneStatus.name} ({rows.length} 問)</div>
        <div className="inline-flex rounded-md border text-[10px] overflow-hidden">
          {THRESHOLDS.map((d) => (
            <button key={d} type="button"
              onClick={() => setThreshold(d)}
              className={`px-1.5 py-0.5 transition-colors ${threshold === d ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {d}d+
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          {threshold}日以上経過した {doneStatus.name} 問題はありません
        </div>
      ) : (
        <table className="text-xs w-full">
          <thead>
            <tr className="text-[10px] text-muted-foreground border-b">
              <th className="text-left font-medium pr-2 py-1">Code · Name</th>
              <th className="text-right font-medium px-2 py-1 w-24">Last {doneStatus.name}</th>
              <th className="text-right font-medium pl-2 py-1 w-14">経過</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row) => (
              <tr key={row.problemId}
                className="border-t hover:bg-accent cursor-pointer"
                onClick={() => onOpenProblem?.(row.problemId)}>
                <td className="pr-2 py-1">
                  <span className="font-mono text-[11px] mr-1.5">{row.code}</span>
                  <span className="text-[11px]">{row.name}</span>
                </td>
                <td className="text-right px-2 py-1 tabular-nums text-[11px] text-muted-foreground">
                  {row.doneDate}
                </td>
                <td className="text-right pl-2 py-1 tabular-nums text-[11px] font-semibold">
                  {row.daysSinceDone}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 20 && (
        <div className="text-[10px] text-muted-foreground">他 {rows.length - 20} 問あり</div>
      )}
      <div className="text-[10px] text-muted-foreground">
        試験前の抜き打ち復習対象。クリックで problem を開いて answer 追加
      </div>
    </div>
  );
}
