import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1["review-schedule"]["$get"]>["data"][number];

export const reviewScheduleKeys = {
  all: ["review-schedule"] as const,
  list: (fieldId: string | null, asOf?: string | null, scopeId?: string | null) =>
    [...reviewScheduleKeys.all, "list", fieldId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

/**
 * Plan の overlay (next-review / smooth-future projection) 用の FSRS schedule。
 * 旧名 useReviewList (2026-06-15 改名)。
 */
export function useReviewSchedule(fieldId?: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: reviewScheduleKeys.list(fieldId ?? null, asOf, scopeId),
    queryFn: async () => {
      const query: { field_id?: string; as_of?: string; scope_id?: string } = {};
      if (fieldId) query.field_id = fieldId;
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1["review-schedule"].$get({ query }));
      return json.data;
    },
    // 全 problems の schedule を計算する重い endpoint。sidebar badge も見るので
    // ナビゲーションのたびに refetch しないよう長めに。
    staleTime: 5 * 60_000,
    // asOf 変更時 (= 日付ナビゲーション) は前回データを表示しつつ裏で fetch。
    placeholderData: keepPreviousData,
  });
}
