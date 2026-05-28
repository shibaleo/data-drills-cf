/**
 * マルチユーザ境界を強制するヘルパー群。
 *
 * 各 route ハンドラ冒頭で `requireProjectOwnership(c, projectId)` を呼ぶ。
 * - 認証されたユーザが対象 project の所有者でない場合は 404 を返す。
 *   (= 認可失敗で 403 を出すと "存在は確認できる" 情報漏れ。404 で隠蔽。)
 */

import type { Context } from "hono";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

/** ハンドラから auth 結果を取り出す。middleware 経由でセット済み。 */
export function getAuth(c: Context<Env>): AuthResult {
  return c.get("authResult");
}

/**
 * 指定された projectId が認証 user のものか検証する。
 * 所有していない (または存在しない) 場合は false を返す。
 */
export async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  if (!userId) return false;  // API key で userId 空文字 / 未マイグレ user → 拒否
  const [row] = await db.select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return !!row;
}

/**
 * problem → project.userId のチェック。
 * answer/review/problem_file 経由のリソースは更にこれを呼ぶか、直接 SQL JOIN する。
 */
export async function ownsProblem(problemId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: problem.id })
    .from(problem)
    .innerJoin(project, eq(problem.projectId, project.id))
    .where(and(eq(problem.id, problemId), eq(project.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** flashcard → project.userId のチェック。 */
export async function ownsFlashcard(flashcardId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { flashcard } = await import("@/lib/db/schema");
  const rows = await db.select({ id: flashcard.id })
    .from(flashcard)
    .innerJoin(project, eq(flashcard.projectId, project.id))
    .where(and(eq(flashcard.id, flashcardId), eq(project.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** answer → problem → project.userId のチェック。 */
export async function ownsAnswer(answerId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { answer, problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: answer.id })
    .from(answer)
    .innerJoin(problem, eq(answer.problemId, problem.id))
    .innerJoin(project, eq(problem.projectId, project.id))
    .where(and(eq(answer.id, answerId), eq(project.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** review → answer → problem → project.userId のチェック。 */
export async function ownsReview(reviewId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { review, answer, problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: review.id })
    .from(review)
    .innerJoin(answer, eq(review.answerId, answer.id))
    .innerJoin(problem, eq(answer.problemId, problem.id))
    .innerJoin(project, eq(problem.projectId, project.id))
    .where(and(eq(review.id, reviewId), eq(project.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
