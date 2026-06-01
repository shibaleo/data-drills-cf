/**
 * Same-day repeat efficacy — 同日に N 回解いた問題の最終 status 分布。
 *
 * 行動: 「Miss 問題は同日に 2-3 回回した方が効果が高い」のような
 * 学習パターンを発見する。集中復習 vs 分散復習の trade-off。
 */
import { useMemo } from "react";
import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Props = {
  problems: ProblemWithAnswers[];
  statuses: Status[];
};

type Bucket = {
  label: string;          // "1回" / "2回" / "3回" / "4+回"
  samples: number;        // 該当 problem 数
  missLikeRate: number;   // 直後 (= 同日最後の attempt) で Miss 系のまま残る率
  upgradeRate: number;    // 直後に翌レベル以上に上がった率
};

export function SameDayRepeatStats({ problems, statuses }: Props) {
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder),
    [statuses],
  );
  const lowSet = useMemo(() => {
    const cutoff = Math.max(1, Math.floor(sortedStatuses.length * 0.4));
    return new Set(sortedStatuses.slice(0, cutoff).map((s) => s.name));
  }, [sortedStatuses]);
  const rankByName = useMemo(
    () => new Map(sortedStatuses.map((s, i) => [s.name, i])),
    [sortedStatuses],
  );

  const buckets = useMemo<Bucket[]>(() => {
    // 同日 group を構築: problem × date でグルーピング
    type Group = { problemId: string; date: string; attempts: typeof problems[number]["answers"]; firstStatus: string | null };
    const groups: Group[] = [];
    for (const p of problems) {
      // answers は date ASC 前提
      let i = 0;
      while (i < p.answers.length) {
        const d = p.answers[i].date;
        let j = i;
        while (j < p.answers.length && p.answers[j].date === d) j++;
        const chunk = p.answers.slice(i, j);
        if (chunk.length > 0) {
          groups.push({
            problemId: p.id,
            date: d,
            attempts: chunk,
            firstStatus: chunk[0].status,
          });
        }
        i = j;
      }
    }
    // Miss-like (低位 status) スタートの group だけ対象
    const targetGroups = groups.filter(
      (g) => g.firstStatus && lowSet.has(g.firstStatus),
    );

    const bucketDefs = [
      { label: "1×", min: 1, max: 1 },
      { label: "2×", min: 2, max: 2 },
      { label: "3×", min: 3, max: 3 },
      { label: "4+×", min: 4, max: Infinity },
    ];
    return bucketDefs.map((bd) => {
      const inBucket = targetGroups.filter((g) =>
        g.attempts.length >= bd.min && g.attempts.length <= bd.max,
      );
      const samples = inBucket.length;
      let missCount = 0;
      let upgradeCount = 0;
      for (const g of inBucket) {
        const last = g.attempts[g.attempts.length - 1];
        const startRank = rankByName.get(g.firstStatus!) ?? 0;
        const endRank = last.status ? (rankByName.get(last.status) ?? 0) : startRank;
        if (last.status && lowSet.has(last.status)) missCount++;
        if (endRank > startRank) upgradeCount++;
      }
      return {
        label: bd.label,
        samples,
        missLikeRate: samples > 0 ? missCount / samples : 0,
        upgradeRate: samples > 0 ? upgradeCount / samples : 0,
      };
    });
  }, [problems, lowSet, rankByName]);

  const totalSamples = buckets.reduce((s, b) => s + b.samples, 0);
  if (totalSamples < 5) {
    return (
      <div className="rounded-md border p-3 space-y-1">
        <div className="text-xs font-semibold">Same-day repeat (starting from Miss-tier)</div>
        <div className="text-[11px] text-muted-foreground">
          Not enough samples (n={totalSamples}). Stats will appear as more same-day sessions starting from Miss/Rough accumulate.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-xs font-semibold">Same-day repeat (starting from Miss-tier, end-of-day status)</div>
      <table className="text-xs w-full">
        <thead>
          <tr className="text-[10px] text-muted-foreground border-b">
            <th className="text-left font-medium pr-2 py-1 w-16">Reps</th>
            <th className="text-right font-medium px-2 py-1 w-12">n</th>
            <th className="text-right font-medium px-2 py-1">Still Miss-tier</th>
            <th className="text-right font-medium pl-2 py-1">Rank up</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.label} className="border-t">
              <td className="pr-2 py-1 font-semibold">{b.label}</td>
              <td className="text-right px-2 py-1 tabular-nums text-[11px]">{b.samples}</td>
              <td className="text-right px-2 py-1 tabular-nums text-[11px]">
                {b.samples > 0 ? `${Math.round(b.missLikeRate * 100)}%` : "—"}
              </td>
              <td className="text-right pl-2 py-1 tabular-nums text-[11px]">
                {b.samples > 0 ? (
                  <span className={b.upgradeRate >= 0.7 ? "font-semibold text-foreground" : ""}>
                    {Math.round(b.upgradeRate * 100)}%
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-muted-foreground">
        Status of the last attempt of the day. Compare effectiveness of repeated drilling vs single-shot review.
      </div>
    </div>
  );
}
