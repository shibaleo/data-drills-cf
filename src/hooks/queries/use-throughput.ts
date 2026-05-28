import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ThroughputRow = RpcData<typeof rpc.api.v1.throughput.$get>["data"][number];

export const throughputKeys = {
  all: ["throughput"] as const,
  list: (projectId: string) => [...throughputKeys.all, "list", projectId] as const,
};

export function useThroughputList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? throughputKeys.list(projectId) : throughputKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.throughput.$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}
