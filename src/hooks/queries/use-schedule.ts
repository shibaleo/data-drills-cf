import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ScheduleRow = RpcData<typeof rpc.api.v1.schedule.$get>["data"][number];

export const scheduleKeys = {
  all: ["schedule"] as const,
  list: (projectId: string) => [...scheduleKeys.all, "list", projectId] as const,
};

export function useScheduleList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? scheduleKeys.list(projectId) : scheduleKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.schedule.$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}
