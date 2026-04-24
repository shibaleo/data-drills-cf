import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { projectKeys } from "@/hooks/queries/use-project-data";

export type LevelRow = RpcData<typeof rpc.api.v1.projects[":id"]["levels"]["$get"]>["data"][number];

export const levelsKeys = {
  all: ["levels"] as const,
  list: (projectId: string) => [...levelsKeys.all, "list", projectId] as const,
};

export function useLevelsList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? levelsKeys.list(projectId) : levelsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].levels.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

function invalidateLevels(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: levelsKeys.list(projectId) });
  qc.invalidateQueries({ queryKey: projectKeys.levels(projectId) });
}

export function useCreateLevel(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.projects[":id"].levels.$post({ param: { id: projectId! }, json: payload })),
    onSuccess: () => projectId && invalidateLevels(qc, projectId),
  });
}

export function useUpdateLevel(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(
        rpc.api.v1.projects[":id"].levels[":entityId"].$put({
          param: { id: projectId!, entityId: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => projectId && invalidateLevels(qc, projectId),
  });
}

export function useDeleteLevel(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        rpc.api.v1.projects[":id"].levels[":entityId"].$delete({
          param: { id: projectId!, entityId: id },
        }),
      ),
    onSuccess: () => projectId && invalidateLevels(qc, projectId),
  });
}

export function useReorderLevels(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        rpc.api.v1.projects[":id"].levels.reorder.$patch({
          param: { id: projectId! },
          json: { ids },
        }),
      ),
    onMutate: async (ids) => {
      if (!projectId) return;
      const key = levelsKeys.list(projectId);
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
      if (!projectId || !ctx?.previous) return;
      qc.setQueryData(levelsKeys.list(projectId), ctx.previous);
    },
    onSettled: () => projectId && invalidateLevels(qc, projectId),
  });
}
