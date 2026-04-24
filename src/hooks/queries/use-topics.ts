import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TopicRow = RpcData<typeof rpc.api.v1.projects[":id"]["topics"]["$get"]>["data"][number];

export const topicsKeys = {
  all: ["topics"] as const,
  list: (projectId: string) => [...topicsKeys.all, "list", projectId] as const,
};

export function useTopicsList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? topicsKeys.list(projectId) : topicsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].topics.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateTopic(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.projects[":id"].topics.$post({ param: { id: projectId! }, json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: topicsKeys.list(projectId) });
    },
  });
}

export function useUpdateTopic(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(
        rpc.api.v1.projects[":id"].topics[":entityId"].$put({
          param: { id: projectId!, entityId: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: topicsKeys.list(projectId) });
    },
  });
}

export function useDeleteTopic(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        rpc.api.v1.projects[":id"].topics[":entityId"].$delete({
          param: { id: projectId!, entityId: id },
        }),
      ),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: topicsKeys.list(projectId) });
    },
  });
}

export function useReorderTopics(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        rpc.api.v1.projects[":id"].topics.reorder.$patch({
          param: { id: projectId! },
          json: { ids },
        }),
      ),
    onMutate: async (ids) => {
      if (!projectId) return;
      const key = topicsKeys.list(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TopicRow[]>(key);
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          key,
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!projectId || !ctx?.previous) return;
      qc.setQueryData(topicsKeys.list(projectId), ctx.previous);
    },
    onSettled: () => {
      if (projectId) qc.invalidateQueries({ queryKey: topicsKeys.list(projectId) });
    },
  });
}
