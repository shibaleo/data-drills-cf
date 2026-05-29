/**
 * Backlog membership filter — pure function shared by server (fetchMembers)
 * and client (edit page preview).
 *
 * セマンティクスは「指定されたカテゴリを **すべて** 通過した問題」。
 * 各カテゴリ (subject/level) 内は OR、カテゴリ間は AND。
 * 空配列 / 未指定のカテゴリは「制約なし」。
 */

import type { BacklogFilter } from "@/lib/db/schema";

export type ProblemForFilter = {
  subjectId: string | null;
  levelId: string | null;
};

export function matchesBacklogFilter(p: ProblemForFilter, filter: BacklogFilter): boolean {
  if (filter.subjectIds?.length) {
    if (!p.subjectId || !filter.subjectIds.includes(p.subjectId)) return false;
  }
  if (filter.levelIds?.length) {
    if (!p.levelId || !filter.levelIds.includes(p.levelId)) return false;
  }
  return true;
}

export function applyBacklogFilter<T extends ProblemForFilter>(
  problems: T[],
  filter: BacklogFilter,
): T[] {
  return problems.filter((p) => matchesBacklogFilter(p, filter));
}
