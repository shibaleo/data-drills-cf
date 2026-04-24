import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type Project = RpcData<typeof rpc.api.v1.projects.$get>["data"][number];
export type LookupItem = RpcData<typeof rpc.api.v1.projects[":id"]["subjects"]["$get"]>["data"][number];
export type StatusItem = RpcData<typeof rpc.api.v1.statuses.$get>["data"][number];

export const projectKeys = {
  all: ["project-data"] as const,
  projects: () => [...projectKeys.all, "projects"] as const,
  subjects: (projectId: string) => [...projectKeys.all, "subjects", projectId] as const,
  levels: (projectId: string) => [...projectKeys.all, "levels", projectId] as const,
  statuses: () => [...projectKeys.all, "statuses"] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.projects(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.projects.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSubjects(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? projectKeys.subjects(projectId) : projectKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].subjects.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

export function useLevels(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? projectKeys.levels(projectId) : projectKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].levels.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

export function useStatuses() {
  return useQuery({
    queryKey: projectKeys.statuses(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.statuses.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateProjectData() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: projectKeys.all });
  }, [qc]);
}

/* ── Project mutations ── */

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null }) =>
      unwrap(rpc.api.v1.projects.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.projects() }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(rpc.api.v1.projects[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.projects() }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.projects[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.projects() }),
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1.projects.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: projectKeys.projects() });
      const previous = qc.getQueryData<Project[]>(projectKeys.projects());
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          projectKeys.projects(),
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKeys.projects(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: projectKeys.projects() }),
  });
}
