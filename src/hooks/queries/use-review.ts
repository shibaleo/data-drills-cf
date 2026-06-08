import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1.review.$get>["data"][number];

export const reviewKeys = {
  all: ["review"] as const,
  list: (projectId: string, asOf?: string | null, scopeId?: string | null) =>
    [...reviewKeys.all, "list", projectId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

export function useReviewList(projectId: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: projectId ? reviewKeys.list(projectId, asOf, scopeId) : reviewKeys.all,
    queryFn: async () => {
      const query: { project_id: string; as_of?: string; scope_id?: string } = { project_id: projectId! };
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1.review.$get({ query }));
      return json.data;
    },
    enabled: !!projectId,
    // review endpoint は全 problems の schedule を計算する重さ。sidebar badge も見るので
    // ナビゲーションのたびに refetch しないよう長めに。
    staleTime: 5 * 60_000,
  });
}
