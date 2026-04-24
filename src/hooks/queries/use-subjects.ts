import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { projectKeys } from "@/hooks/queries/use-project-data";

export type SubjectRow = RpcData<typeof rpc.api.v1.projects[":id"]["subjects"]["$get"]>["data"][number];

export const subjectsKeys = {
  all: ["subjects"] as const,
  list: (projectId: string) => [...subjectsKeys.all, "list", projectId] as const,
};

export function useSubjectsList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? subjectsKeys.list(projectId) : subjectsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].subjects.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

function invalidateSubjects(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: subjectsKeys.list(projectId) });
  qc.invalidateQueries({ queryKey: projectKeys.subjects(projectId) });
}

export function useCreateSubject(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1.projects[":id"].subjects.$post({ param: { id: projectId! }, json: payload })),
    onSuccess: () => projectId && invalidateSubjects(qc, projectId),
  });
}

export function useUpdateSubject(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(
        rpc.api.v1.projects[":id"].subjects[":entityId"].$put({
          param: { id: projectId!, entityId: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => projectId && invalidateSubjects(qc, projectId),
  });
}

export function useDeleteSubject(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        rpc.api.v1.projects[":id"].subjects[":entityId"].$delete({
          param: { id: projectId!, entityId: id },
        }),
      ),
    onSuccess: () => projectId && invalidateSubjects(qc, projectId),
  });
}

export function useReorderSubjects(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        rpc.api.v1.projects[":id"].subjects.reorder.$patch({
          param: { id: projectId! },
          json: { ids },
        }),
      ),
    onMutate: async (ids) => {
      if (!projectId) return;
      const key = subjectsKeys.list(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SubjectRow[]>(key);
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
      qc.setQueryData(subjectsKeys.list(projectId), ctx.previous);
    },
    onSettled: () => projectId && invalidateSubjects(qc, projectId),
  });
}
