import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

/**
 * 1 problem の SRS state row (= /api/v1/srs の 1 要素)。
 * 旧名 ReviewRow (review→review-schedule→srs と段階的に rename)。
 */
export type SrsRow = RpcData<typeof rpc.api.v1.srs["$get"]>["data"][number];

export const srsKeys = {
  all: ["srs"] as const,
  list: (fieldId: string | null, asOf?: string | null, scopeId?: string | null) =>
    [...srsKeys.all, "list", fieldId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

/**
 * Plan の overlay (next-step / forecast cascade) 用の SRS state per problem。
 * 旧名 useReviewSchedule / useReviewList。
 */
export function useSrs(fieldId?: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: srsKeys.list(fieldId ?? null, asOf, scopeId),
    queryFn: async () => {
      const query: { field_id?: string; as_of?: string; scope_id?: string } = {};
      if (fieldId) query.field_id = fieldId;
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1.srs.$get({ query }));
      return json.data;
    },
    // 全 problems の SRS state を計算する重い endpoint。
    // ナビゲーションのたびに refetch しないよう長めに。
    staleTime: 5 * 60_000,
    // asOf 変更時 (= 日付ナビゲーション) は前回データを表示しつつ裏で fetch。
    placeholderData: keepPreviousData,
  });
}
