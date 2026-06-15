import type { QueryClient } from "@tanstack/react-query";
import { rpc, unwrap } from "@/lib/rpc-client";
import { problemsKeys } from "@/hooks/queries/use-problems";
import { reviewKeys } from "@/hooks/queries/use-review";
import { answerHistoryKeys } from "@/hooks/queries/use-answer-history";
import { fieldKeys } from "@/hooks/queries/use-field-data";

/**
 * Scope 選択時に呼ぶ。当該 field の重い list/lookup を並列 prefetch して、
 * Plan / stats / digest / scopes detail のどれに遷移しても cache hit に
 * なるようにする。staleTime 5 分以内なら no-op。
 *
 * 注: 旧 review/throughput ページは 2026-06-12 に Plan に吸収されたが、
 * `/api/v1/review` endpoint は Plan の FSRS schedule overlay (= next
 * review の描画) に使われ続けるため prefetch 対象に含める。
 */
export function prefetchScopeFieldResources(qc: QueryClient, fieldId: string) {
  return Promise.all([
    qc.prefetchQuery({
      queryKey: problemsKeys.list(fieldId),
      queryFn: async () => {
        const json = await unwrap(rpc.api.v1["problems-list"].$get({ query: { field_id: fieldId } }));
        return json.data;
      },
      staleTime: 5 * 60_000,
    }),
    qc.prefetchQuery({
      queryKey: reviewKeys.list(fieldId, null, null),
      queryFn: async () => {
        const json = await unwrap(rpc.api.v1.review.$get({ query: { field_id: fieldId } }));
        return json.data;
      },
      staleTime: 5 * 60_000,
    }),
    qc.prefetchQuery({
      queryKey: answerHistoryKeys.list(fieldId, null),
      queryFn: async () => {
        const json = await unwrap(rpc.api.v1["answer-history"].$get({ query: { field_id: fieldId } }));
        return json.data;
      },
      staleTime: 5 * 60_000,
    }),
    qc.prefetchQuery({
      queryKey: fieldKeys.subjects(fieldId),
      queryFn: async () => {
        const json = await unwrap(rpc.api.v1.fields[":id"].subjects.$get({ param: { id: fieldId } }));
        return json.data;
      },
      staleTime: 5 * 60_000,
    }),
    qc.prefetchQuery({
      queryKey: fieldKeys.levels(fieldId),
      queryFn: async () => {
        const json = await unwrap(rpc.api.v1.fields[":id"].levels.$get({ param: { id: fieldId } }));
        return json.data;
      },
      staleTime: 5 * 60_000,
    }),
  ]);
}

/**
 * scope の filter.fieldIds[] が複数なら全部 prefetch。0 件なら何もしない
 * (cross-field 全体 scope は重すぎるので明示的に prefetch しない方針)。
 */
export function prefetchScopeFromFilter(
  qc: QueryClient,
  filter: { fieldIds?: string[] } | null | undefined,
) {
  const ids = filter?.fieldIds ?? [];
  if (ids.length === 0) return Promise.resolve([]);
  return Promise.all(ids.map((id) => prefetchScopeFieldResources(qc, id)));
}
