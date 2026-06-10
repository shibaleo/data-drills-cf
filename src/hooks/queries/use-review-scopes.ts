/**
 * Plan A 移行後の薄い wrapper。
 *
 * 旧 review_scope テーブル/route は廃止し、すべての detail page hook を canonical
 * `scope` テーブル (= /api/v1/scopes/:id/...) 経由に統一する。
 * detail page の既存 consumer (scope.field_id / scope.scope_id) が破綻しないよう、
 * canonical detail に shape adapter を被せる:
 *   - scope.field_id ← scope.filter.fieldIds?.[0] ?? null  (single-field 派生)
 *   - scope.scope_id ← scope.id  (self ref; UI の localStorage キー等で参照)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { ScopeUpdateInput } from "@/lib/schemas/scope";
import { scopesKeys } from "@/hooks/queries/use-scopes";
import { reviewKeys } from "@/hooks/queries/use-review";
import { problemsKeys } from "@/hooks/queries/use-problems";

type CanonicalDetail = RpcData<typeof rpc.api.v1.scopes[":id"]["detail"]["$get"]>["data"];

export type ReviewScopeDetail = ReturnType<typeof adaptDetail>;
export type ReviewScopeMember = ReviewScopeDetail["members"][number];

function adaptDetail(d: CanonicalDetail) {
  const fieldIds = d.scope.filter?.fieldIds;
  const derivedFieldId = fieldIds && fieldIds.length > 0 ? fieldIds[0] : null;
  return {
    scope: {
      ...d.scope,
      // back-compat: detail page が期待する 2 列を派生
      field_id: derivedFieldId,
      scope_id: d.scope.id,
    },
    members: d.members,
    subjects: d.subjects,
    levels: d.levels,
    as_of: null as string | null,
  };
}

export const reviewScopeKeys = {
  all: ["review-scopes-v2"] as const,
  detail: (id: string) => [...scopesKeys.fullDetail(id)] as const,
};

export function useReviewScope(id: string | undefined, _asOf?: string | null) {
  // asOf は将来 canonical /scopes/:id/detail に as_of query 追加して対応する想定。
  // 現状の detail page は asOf を client-side computation 専用に使っているので一旦無視。
  return useQuery({
    queryKey: id ? scopesKeys.fullDetail(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].detail.$get({ param: { id: id! } }));
      return adaptDetail(json.data);
    },
    enabled: !!id,
  });
}

export type ReviewScopeRevisionEntry = RpcData<typeof rpc.api.v1.scopes[":id"]["history"]["$get"]>["data"][number];

export function useReviewScopeRevisions(id: string | undefined) {
  // history は scope/layer/milestone の混在 revision を summary 付きで時系列に返す。
  // detail page の history panel が要求する shape (kind/entity_id/summary) と一致する。
  return useQuery({
    queryKey: id ? scopesKeys.history(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].history.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

/**
 * 旧 API: payload に scope_id (canonical 参照) が含まれていたが、canonical 化後は
 * 自身が canonical なので無視する。それ以外のフィールドはそのまま canonical schema へ。
 */
type LegacyUpdateInput = ScopeUpdateInput & { scope_id?: string | null };

export function useUpdateReviewScope(id: string, _fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LegacyUpdateInput) => {
      const { scope_id: _ignored, ...rest } = payload;
      return unwrap(rpc.api.v1.scopes[":id"].$put({ param: { id }, json: rest }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scopesKeys.fullDetail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
      qc.invalidateQueries({ queryKey: scopesKeys.revisions(id) });
      qc.invalidateQueries({ queryKey: reviewKeys.all });
      qc.invalidateQueries({ queryKey: problemsKeys.all });
    },
  });
}

export function useArchiveReviewScope(_fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.scopes[":id"].$delete({ param: { id } })),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: scopesKeys.fullDetail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
    },
  });
}
