import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";

/* ── Domain types — all derived from the server's `/problems-list` RPC shape ──
 *
 * Single source of truth. Server changes a field, everything here updates,
 * and all consumers get a compile error.
 */

export type Problem = Pick<
  ProblemWithAnswers,
  | "id"
  | "code"
  | "name"
  | "subject_id"
  | "level_id"
  | "checkpoint"
  | "standard_time"
  | "project_id"
  | "created_at"
  | "updated_at"
  | "problem_files"
>;

export type AnswerWithReviews = ProblemWithAnswers["answers"][number];
export type Answer = Omit<AnswerWithReviews, "reviews">;
export type Review = AnswerWithReviews["reviews"][number];
export type ProblemFile = ProblemWithAnswers["problem_files"][number];

/* ── ReviewType enum (kept hand-written: Japanese labels have no server origin) ── */

export type ReviewType =
  | '質問' | '理解' | '確認' | '認知' | '混同'
  | '不理解' | '不作為' | '桁ミス' | '思考特性' | '問題傾向'
  | '符号ミス' | '問題文不読' | '足し算ミス' | 'Pending理解'
  | '期間数えミス' | '数字見間違い' | 'DONE' | '解答パターン';

export const REVIEW_TYPES: ReviewType[] = [
  '質問', '理解', '確認', '認知', '混同',
  '不理解', '不作為', '桁ミス', '思考特性', '問題傾向',
  '符号ミス', '問題文不読', '足し算ミス', 'Pending理解',
  '期間数えミス', '数字見間違い', 'DONE', '解答パターン',
];
