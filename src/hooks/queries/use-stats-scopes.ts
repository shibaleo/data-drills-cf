import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  StatsScopeCreateInput,
  StatsScopeUpdateInput,
} from "@/lib/schemas/stats-scope";

export type StatsScopeRow = RpcData<typeof rpc.api.v1["stats-scopes"]["$get"]>["data"][number];
export type StatsScopeDetail = RpcData<typeof rpc.api.v1["stats-scopes"][":id"]["$get"]>["data"];

export const statsScopeKeys = {
  all: ["stats-scopes"] as const,
  list: (projectId: string) => [...statsScopeKeys.all, "list", projectId] as const,
  detail: (id: string) => [...statsScopeKeys.all, "detail", id] as const,
};

export function useStatsScopesList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? statsScopeKeys.list(projectId) : statsScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["stats-scopes"].$get({ query: { project_id: projectId! } }));
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useStatsScope(id: string | undefined) {
  return useQuery({
    queryKey: id ? statsScopeKeys.detail(id) : statsScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["stats-scopes"][":id"].$get({
        param: { id: id! },
        query: {},
      }));
      return json.data;
    },
    enabled: !!id,
  });
}

export type StatsScopeRevisionEntry = RpcData<typeof rpc.api.v1["stats-scopes"][":id"]["revisions"]["$get"]>["data"][number];

export function useStatsScopeRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? [...statsScopeKeys.detail(id), "revisions"] : statsScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["stats-scopes"][":id"].revisions.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateStatsScope(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StatsScopeCreateInput) =>
      unwrap(rpc.api.v1["stats-scopes"].$post({ json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: statsScopeKeys.list(projectId) });
    },
  });
}

export function useUpdateStatsScope(id: string, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StatsScopeUpdateInput) =>
      unwrap(rpc.api.v1["stats-scopes"][":id"].$put({ param: { id }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: statsScopeKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: statsScopeKeys.list(projectId) });
    },
  });
}

export function useArchiveStatsScope(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["stats-scopes"][":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: statsScopeKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: statsScopeKeys.list(projectId) });
    },
  });
}
