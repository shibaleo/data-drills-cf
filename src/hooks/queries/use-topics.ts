import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TopicRow = RpcData<typeof rpc.api.v1.fields[":id"]["topics"]["$get"]>["data"][number];

export const topicsKeys = {
  all: ["topics"] as const,
  list: (fieldId: string) => [...topicsKeys.all, "list", fieldId] as const,
};

export function useTopicsList(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? topicsKeys.list(fieldId) : topicsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.fields[":id"].topics.$get({ param: { id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
  });
}

export function useCreateTopic(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.fields[":id"].topics.$post({ param: { id: fieldId! }, json: payload })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: topicsKeys.list(fieldId) });
    },
  });
}

export function useUpdateTopic(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(
        rpc.api.v1.fields[":id"].topics[":entityId"].$put({
          param: { id: fieldId!, entityId: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: topicsKeys.list(fieldId) });
    },
  });
}

export function useDeleteTopic(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        rpc.api.v1.fields[":id"].topics[":entityId"].$delete({
          param: { id: fieldId!, entityId: id },
        }),
      ),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: topicsKeys.list(fieldId) });
    },
  });
}

export function useReorderTopics(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        rpc.api.v1.fields[":id"].topics.reorder.$patch({
          param: { id: fieldId! },
          json: { ids },
        }),
      ),
    onMutate: async (ids) => {
      if (!fieldId) return;
      const key = topicsKeys.list(fieldId);
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
      if (!fieldId || !ctx?.previous) return;
      qc.setQueryData(topicsKeys.list(fieldId), ctx.previous);
    },
    onSettled: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: topicsKeys.list(fieldId) });
    },
  });
}
