/**
 * マルチユーザ境界を強制するヘルパー群。各 route ハンドラ冒頭で呼ぶ。
 * - 認証されたユーザが対象 field の所有者でない場合は 404 を返す。
 *   (= 認可失敗で 403 を出すと "存在は確認できる" 情報漏れ。404 で隠蔽。)
 */

import type { Context } from "hono";
import { db } from "@/lib/db";
import { field } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export function getAuth(c: Context<Env>): AuthResult {
  return c.get("authResult");
}

/** 指定された fieldId が認証 user のものか検証する。 */
export async function ownsField(fieldId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db.select({ id: field.id })
    .from(field)
    .where(and(eq(field.id, fieldId), eq(field.userId, userId)))
    .limit(1);
  return !!row;
}

/** 互換 alias: 旧 project は field に同じ UUID で移行済 (Phase 1)。 */
export const ownsProject = ownsField;

export async function ownsProblem(problemId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: problem.id })
    .from(problem)
    .innerJoin(field, eq(problem.fieldId, field.id))
    .where(and(eq(problem.id, problemId), eq(field.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function ownsFlashcard(flashcardId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { flashcard } = await import("@/lib/db/schema");
  const rows = await db.select({ id: flashcard.id })
    .from(flashcard)
    .innerJoin(field, eq(flashcard.fieldId, field.id))
    .where(and(eq(flashcard.id, flashcardId), eq(field.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function ownsAnswer(answerId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { answer, problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: answer.id })
    .from(answer)
    .innerJoin(problem, eq(answer.problemId, problem.id))
    .innerJoin(field, eq(problem.fieldId, field.id))
    .where(and(eq(answer.id, answerId), eq(field.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function ownsReview(reviewId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { review, answer, problem } = await import("@/lib/db/schema");
  const rows = await db.select({ id: review.id })
    .from(review)
    .innerJoin(answer, eq(review.answerId, answer.id))
    .innerJoin(problem, eq(answer.problemId, problem.id))
    .innerJoin(field, eq(problem.fieldId, field.id))
    .where(and(eq(review.id, reviewId), eq(field.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
