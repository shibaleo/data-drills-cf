/**
 * Plan view の overlay assembly。allocated/review/answer-history を 1 つの
 * OverlayBlock[] に統合する pure ロジック。
 *
 * 構成 (overlay 種別):
 *   - smooth-future : 初回未着手の allocated.future から projection
 *   - review-next   : 既解答 problem の次回 review 日 (+ その先の smooth chain)
 *   - past-throughput: 過去 re-answer (= 初回でない過去解答)
 */
import type { AllocatedProblem } from "@/lib/backlog-allocate";
import type { OverlayBlock } from "@/components/tetris";
import type { SrsRow } from "@/hooks/queries/use-srs";
import type { AnswerHistoryRow } from "@/hooks/queries/use-answer-history";
import { computeNextReview } from "@/lib/srs-scoring";

/**
 * 順調進行を仮定して将来 review 日を生成。
 * 評価軸の chain は statusByName の sortOrder 順から動的に構築し、
 * stabilityDays <= 0 の "no-grade" な status (= First/New/Miss) は除外する。
 * これで status を rename しても本 lib の変更は不要。
 */
function projectSmoothFuture(args: {
  problemId: string;
  code: string;
  name: string | null;
  startDate: string;
  startStatus: string;
  standardTimeSec: number | null;
  lastDurationSec: number | null;
  statusByName: Map<string, { stabilityDays: number; color: string | null; sortOrder: number }>;
  horizonDate: string;
}): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  // chain: sortOrder ASC, stability > 0 のものだけ (= "Rough"〜"Solid" 相当)
  const chain = [...args.statusByName.entries()]
    .filter(([, info]) => info.stabilityDays > 0)
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([name]) => name);
  if (chain.length === 0) return out;
  let date = args.startDate;
  // startStatus が chain に含まれる場合はそこから次へ進む。
  // 含まれない (= "First"/"New"/未評価/Miss) 場合は chain[0] から開始 = chainIdx = -1
  let chainIdx = chain.indexOf(args.startStatus);
  let safety = 200;
  while (safety-- > 0) {
    const nextIdx = Math.min(chainIdx + 1, chain.length - 1);
    const nextStatusName = chain[nextIdx];
    const info = args.statusByName.get(nextStatusName);
    if (!info || info.stabilityDays <= 0) break;
    const projected = computeNextReview(date, info.stabilityDays, args.standardTimeSec, args.lastDurationSec);
    if (projected <= date) break;
    if (projected > args.horizonDate) break;
    const intervalDays = Math.round(
      (new Date(`${projected}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86400000,
    );
    out.push({
      problemId: args.problemId,
      code: args.code,
      name: args.name,
      date: projected,
      color: info.color ?? "#a3a3a3",
      statusName: nextStatusName,
      stabilityDays: intervalDays,
      kind: "forecast",
    });
    date = projected;
    chainIdx = nextIdx;
  }
  return out;
}

export type AssembleOverlayInput = {
  /** scope の member 全件 (problemId → standardTime lookup 用) */
  memberStandardTimeById: Map<string, number | null>;
  allocated: AllocatedProblem[];
  reviews: SrsRow[];
  history: AnswerHistoryRow[];
  statusByName: Map<string, { stabilityDays: number; color: string | null; sortOrder: number }>;
  horizonDate: string;
  today: string;
};

export function assembleOverlay(input: AssembleOverlayInput): OverlayBlock[] {
  const { memberStandardTimeById, allocated, reviews, history, statusByName, horizonDate, today } = input;
  const out: OverlayBlock[] = [];

  // 1) 初回未着手 (allocated.future) から smooth-future を投影
  for (const a of allocated) {
    if (a.side !== "future") continue;
    out.push(
      ...projectSmoothFuture({
        problemId: a.problemId,
        code: a.code,
        name: a.name,
        startDate: a.date,
        startStatus: "First",
        standardTimeSec: memberStandardTimeById.get(a.problemId) ?? null,
        lastDurationSec: null,
        statusByName,
        horizonDate,
      }),
    );
  }

  // 2) 既解答 problem の next review + smooth chain
  for (const r of reviews) {
    if (r.answerCount === 0) continue;
    const stColor = r.statusColor ?? "#a3a3a3";
    const reviewIntervalDays = Math.max(0, Math.round(
      (new Date(`${r.nextReview}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
    ));
    out.push({
      problemId: r.problemId,
      code: r.code,
      name: r.name,
      date: r.nextReview,
      color: stColor,
      statusName: r.lastStatus,
      stabilityDays: reviewIntervalDays,
      kind: "next-step",
    });
    out.push(
      ...projectSmoothFuture({
        problemId: r.problemId,
        code: r.code,
        name: r.name,
        startDate: r.nextReview,
        startStatus: r.lastStatus,
        standardTimeSec: r.standardTime ?? null,
        lastDurationSec: r.lastDuration ?? null,
        statusByName,
        horizonDate,
      }),
    );
  }

  // 3) 過去 re-answer を opacity 0.5 で overlay。初回回答は allocated.past で表示済なのでスキップ
  for (const r of history) {
    if (r.date > today) continue;
    if (!r.prevStatusColor) continue;
    out.push({
      problemId: r.problemId,
      code: r.code,
      name: r.name,
      date: r.date,
      color: r.prevStatusColor,
      statusName: r.prevStatusName,
      opacity: 0.5,
      kind: "throughput",
    });
  }

  return out;
}
