/**
 * Member filter — pure function shared by:
 *   - server-side fetchMembers (backlog, review_scope)
 *   - client-side preview editors
 *
 * セマンティクスは「指定されたカテゴリを **すべて** 通過した問題」。
 * 各カテゴリ (subject/level) 内は OR、カテゴリ間は AND。
 * 空配列 / 未指定のカテゴリは「制約なし」。
 */

import type { MemberFilter } from "@/lib/db/schema";

export type ProblemForFilter = {
  fieldId?: string | null;
  subjectId: string | null;
  levelId: string | null;
};

export function matchesMemberFilter(p: ProblemForFilter, filter: MemberFilter): boolean {
  if (filter.fieldIds?.length) {
    if (!p.fieldId || !filter.fieldIds.includes(p.fieldId)) return false;
  }
  if (filter.subjectIds?.length) {
    if (!p.subjectId || !filter.subjectIds.includes(p.subjectId)) return false;
  }
  if (filter.levelIds?.length) {
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
