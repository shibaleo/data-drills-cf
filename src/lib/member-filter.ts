/**
 * Member filter — pure function shared by:
 *   - server-side fetchMembers (backlog, review_scope)
 *   - client-side preview editors
 *
 * セマンティクスは「指定されたカテゴリを **すべて** 通過した問題」。
 * 各カテゴリ (subject/level) 内は OR、カテゴリ間は AND。
 * - undefined  = そのカテゴリは「制約なし」 (= all 通過)
 * - 空配列 []  = そのカテゴリで該当する member がいない (= 全 reject、空 scope)
 * - 配列 [...] = 列挙された ID のみ通過
 */

import type { MemberFilter } from "@/lib/db/schema";

export type ProblemForFilter = {
  fieldId?: string | null;
  subjectId: string | null;
  levelId: string | null;
};

export function matchesMemberFilter(p: ProblemForFilter, filter: MemberFilter): boolean {
  if (filter.fieldIds !== undefined) {
    if (!p.fieldId || !filter.fieldIds.includes(p.fieldId)) return false;
  }
  if (filter.subjectIds !== undefined) {
    if (!p.subjectId || !filter.subjectIds.includes(p.subjectId)) return false;
  }
  if (filter.levelIds !== undefined) {
    if (!p.levelId || !filter.levelIds.includes(p.levelId)) return false;
  }
  return true;
}

export function applyMemberFilter<T extends ProblemForFilter>(
  problems: T[],
  filter: MemberFilter,
): T[] {
  return problems.filter((p) => matchesMemberFilter(p, filter));
}
