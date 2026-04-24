import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { projectKeys } from "@/hooks/queries/use-project-data";

export type StatusItem = RpcData<typeof rpc.api.v1.statuses.$get>["data"][number];

export const statusesKeys = {
  all: ["statuses"] as const,
  list: () => [...statusesKeys.all, "list"] as const,
};

export function useStatusesList() {
  return useQuery({
    queryKey: statusesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.statuses.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: statusesKeys.list() });
  qc.invalidateQueries({ queryKey: projectKeys.statuses() });
}

export function useCreateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      color?: string | null;
      point?: number;
      sort_order?: number;
      stability_days?: number;
      description?: string | null;
    }) => unwrap(rpc.api.v1.statuses.$post({ json: payload })),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      payload: {
        code?: string;
        name?: string;
        color?: string | null;
        point?: number;
        sort_order?: number;
        stability_days?: number;
        description?: string | null;
      };
    }) => unwrap(rpc.api.v1.statuses[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.statuses[":id"].$delete({ param: { id } })),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReorderStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1.statuses.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: statusesKeys.list() });
      const previous = qc.getQueryData<StatusItem[]>(statusesKeys.list());
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          statusesKeys.list(),
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(statusesKeys.list(), ctx.previous);
    },
    onSettled: () => invalidateAll(qc),
  });
}
