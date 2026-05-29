import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewRow = RpcData<typeof rpc.api.v1.review.$get>["data"][number];

export const reviewKeys = {
  all: ["review"] as const,
  list: (projectId: string, asOf?: string | null) =>
    [...reviewKeys.all, "list", projectId, { asOf: asOf ?? null }] as const,
};

export function useReviewList(projectId: string | undefined, asOf?: string | null) {
  return useQuery({
    queryKey: projectId ? reviewKeys.list(projectId, asOf) : reviewKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.review.$get({
          query: asOf ? { project_id: projectId!, as_of: asOf } : { project_id: projectId! },
        }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}
