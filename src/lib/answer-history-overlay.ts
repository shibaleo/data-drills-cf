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
import type { OverlayBlock } from "@/components/backlog-chart";
import type { ReviewRow } from "@/hooks/queries/use-review";
import type { AnswerHistoryRow } from "@/hooks/queries/use-answer-history";
import { computeNextReview } from "@/lib/review-scoring";

/** 順調な status 進行順 (= 各 review を smooth に通した場合の遷移) */
const SMOOTH_CHAIN = ["Rough", "Fair", "Fluent", "Solid"] as const;

/** 順調進行を仮定して将来 review 日を生成 */
function projectSmoothFuture(args: {
  problemId: string;
  code: string;
  name: string | null;
  startDate: string;
  startStatus: string;
  standardTimeSec: number | null;
  lastDurationSec: number | null;
  statusByName: Map<string, { stabilityDays: number; color: string | null }>;
  horizonDate: string;
}): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  let date = args.startDate;
  let chainIdx = SMOOTH_CHAIN.indexOf(args.startStatus as (typeof SMOOTH_CHAIN)[number]);
  let safety = 200;
  while (safety-- > 0) {
    const nextIdx = Math.min(chainIdx + 1, SMOOTH_CHAIN.length - 1);
    const nextStatusName = SMOOTH_CHAIN[nextIdx];
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
      kind: "smooth-future",
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
  reviews: ReviewRow[];
  history: AnswerHistoryRow[];
  statusByName: Map<string, { stabilityDays: number; color: string | null }>;
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
      kind: "review-next",
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
      kind: "past-throughput",
    });
  }

  return out;
}
