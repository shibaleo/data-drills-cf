import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1.review.$get>["data"][number];

export const reviewKeys = {
  all: ["review"] as const,
  list: (fieldId: string, asOf?: string | null, scopeId?: string | null) =>
    [...reviewKeys.all, "list", fieldId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

export function useReviewList(fieldId: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: fieldId ? reviewKeys.list(fieldId, asOf, scopeId) : reviewKeys.all,
    queryFn: async () => {
      const query: { field_id: string; as_of?: string; scope_id?: string } = { field_id: fieldId! };
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1.review.$get({ query }));
      return json.data;
    },
    enabled: !!fieldId,
    // review endpoint は全 problems の schedule を計算する重さ。sidebar badge も見るので
    // ナビゲーションのたびに refetch しないよう長めに。
    staleTime: 5 * 60_000,
  });
}
