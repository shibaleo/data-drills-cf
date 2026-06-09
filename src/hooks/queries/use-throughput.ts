import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ThroughputRow = RpcData<typeof rpc.api.v1.throughput.$get>["data"][number];

export const throughputKeys = {
  all: ["throughput"] as const,
  list: (fieldId: string, asOf?: string | null) =>
    [...throughputKeys.all, "list", fieldId, { asOf: asOf ?? null }] as const,
};

export function useThroughputList(fieldId: string | undefined, asOf?: string | null) {
  return useQuery({
    queryKey: fieldId ? throughputKeys.list(fieldId, asOf) : throughputKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.throughput.$get({
          query: asOf ? { field_id: fieldId!, as_of: asOf } : { field_id: fieldId! },
        }),
      );
      return json.data;
    },
    enabled: !!fieldId,
    // 全 answer を返す重い endpoint。再 fetch を抑制
    staleTime: 5 * 60_000,
  });
}
