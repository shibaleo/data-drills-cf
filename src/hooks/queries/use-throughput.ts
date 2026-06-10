import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ThroughputRow = RpcData<typeof rpc.api.v1.throughput.$get>["data"][number];

export const throughputKeys = {
  all: ["throughput"] as const,
  list: (fieldId: string | null, asOf?: string | null, scopeId?: string | null) =>
    [...throughputKeys.all, "list", fieldId, { asOf: asOf ?? null, scopeId: scopeId ?? null }] as const,
};

export function useThroughputList(fieldId?: string | undefined, asOf?: string | null, scopeId?: string | null) {
  return useQuery({
    queryKey: throughputKeys.list(fieldId ?? null, asOf, scopeId),
    queryFn: async () => {
      const query: { field_id?: string; as_of?: string; scope_id?: string } = {};
      if (fieldId) query.field_id = fieldId;
      if (asOf) query.as_of = asOf;
      if (scopeId) query.scope_id = scopeId;
      const json = await unwrap(rpc.api.v1.throughput.$get({ query }));
      return json.data;
    },
    // 全 answer を返す重い endpoint。再 fetch を抑制
    staleTime: 5 * 60_000,
  });
}
