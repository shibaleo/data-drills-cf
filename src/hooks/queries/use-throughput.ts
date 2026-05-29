import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ThroughputRow = RpcData<typeof rpc.api.v1.throughput.$get>["data"][number];

export const throughputKeys = {
  all: ["throughput"] as const,
  list: (projectId: string, asOf?: string | null) =>
    [...throughputKeys.all, "list", projectId, { asOf: asOf ?? null }] as const,
};

export function useThroughputList(projectId: string | undefined, asOf?: string | null) {
  return useQuery({
    queryKey: projectId ? throughputKeys.list(projectId, asOf) : throughputKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.throughput.$get({
          query: asOf ? { project_id: projectId!, as_of: asOf } : { project_id: projectId! },
        }),
      );
      return json.data;
    },
    enabled: !!projectId,
    // 全 answer を返す重い endpoint。再 fetch を抑制
    staleTime: 5 * 60_000,
  });
}
