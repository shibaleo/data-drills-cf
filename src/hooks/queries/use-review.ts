import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1.review.$get>["data"][number];

export const reviewKeys = {
  all: ["review"] as const,
  list: (fieldId: string | null, asOf?: string | null, scopeId?: string | null) =>
    [...reviewKeys.all, "list", fieldId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

export function useReviewList(fieldId?: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: reviewKeys.list(fieldId ?? null, asOf, scopeId),
    queryFn: async () => {
      const query: { field_id?: string; as_of?: string; scope_id?: string } = {};
      if (fieldId) query.field_id = fieldId;
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1.review.$get({ query }));
      return json.data;
    },
    // review endpoint は全 problems の schedule を計算する重さ。sidebar badge も見るので
    // ナビゲーションのたびに refetch しないよう長めに。
    staleTime: 5 * 60_000,
    // asOf 変更時 (= 日付ナビゲーション) は前回データを表示しつつ裏で fetch。
    // スピナー切替がなく "即時更新" 感を出す。
    placeholderData: keepPreviousData,
  });
}
