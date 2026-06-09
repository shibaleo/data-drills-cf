import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { fieldKeys } from "@/hooks/queries/use-field-data";

export type LevelRow = RpcData<typeof rpc.api.v1.fields[":id"]["levels"]["$get"]>["data"][number];

export const levelsKeys = {
  all: ["levels"] as const,
  list: (fieldId: string) => [...levelsKeys.all, "list", fieldId] as const,
};

export function useLevelsList(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? levelsKeys.list(fieldId) : levelsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.fields[":id"].levels.$get({ param: { id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
  });
}

function invalidateLevels(qc: ReturnType<typeof useQueryClient>, fieldId: string) {
  qc.invalidateQueries({ queryKey: levelsKeys.list(fieldId) });
  qc.invalidateQueries({ queryKey: fieldKeys.levels(fieldId) });
}

export function useCreateLevel(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.fields[":id"].levels.$post({ param: { id: fieldId! }, json: payload })),
    onSuccess: () => fieldId && invalidateLevels(qc, fieldId),
  });
}

export function useUpdateLevel(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(
        rpc.api.v1.fields[":id"].levels[":entityId"].$put({
          param: { id: fieldId!, entityId: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => fieldId && invalidateLevels(qc, fieldId),
  });
}

export function useDeleteLevel(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        rpc.api.v1.fields[":id"].levels[":entityId"].$delete({
          param: { id: fieldId!, entityId: id },
        }),
      ),
    onSuccess: () => fieldId && invalidateLevels(qc, fieldId),
  });
}

export function useReorderLevels(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        rpc.api.v1.fields[":id"].levels.reorder.$patch({
          param: { id: fieldId! },
          json: { ids },
        }),
      ),
    onMutate: async (ids) => {
      if (!fieldId) return;
      const key = levelsKeys.list(fieldId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<LevelRow[]>(key);
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
      qc.setQueryData(levelsKeys.list(fieldId), ctx.previous);
    },
    onSettled: () => fieldId && invalidateLevels(qc, fieldId),
  });
}
