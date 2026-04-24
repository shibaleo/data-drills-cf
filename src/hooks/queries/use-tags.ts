import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TagRow = RpcData<typeof rpc.api.v1.tags.$get>["data"][number];

export const tagsKeys = {
  all: ["tags"] as const,
  list: () => [...tagsKeys.all, "list"] as const,
};

export function useTags() {
  return useQuery({
    queryKey: tagsKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.tags.$get());
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.tags.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagsKeys.list() }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(rpc.api.v1.tags[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagsKeys.list() }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.tags[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagsKeys.list() }),
  });
}

export function useReorderTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1.tags.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: tagsKeys.list() });
      const previous = qc.getQueryData<TagRow[]>(tagsKeys.list());
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          tagsKeys.list(),
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(tagsKeys.list(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tagsKeys.list() }),
  });
}
