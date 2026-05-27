import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1.review.$get>["data"][number];

export const reviewKeys = {
  all: ["review"] as const,
  list: (projectId: string) => [...reviewKeys.all, "list", projectId] as const,
};

export function useReviewList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? reviewKeys.list(projectId) : reviewKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.review.$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}
