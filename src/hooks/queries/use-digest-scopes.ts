import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  DigestScopeCreateInput,
  DigestScopeUpdateInput,
} from "@/lib/schemas/digest-scope";

export type DigestScopeRow = RpcData<typeof rpc.api.v1["digest-scopes"]["$get"]>["data"][number];
export type DigestScopeDetail = RpcData<typeof rpc.api.v1["digest-scopes"][":id"]["$get"]>["data"];

export const digestScopeKeys = {
  all: ["digest-scopes"] as const,
  list: (projectId: string) => [...digestScopeKeys.all, "list", projectId] as const,
  detail: (id: string) => [...digestScopeKeys.all, "detail", id] as const,
};

export function useDigestScopesList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? digestScopeKeys.list(projectId) : digestScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["digest-scopes"].$get({ query: { project_id: projectId! } }));
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useDigestScope(id: string | undefined) {
  return useQuery({
    queryKey: id ? digestScopeKeys.detail(id) : digestScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["digest-scopes"][":id"].$get({
        param: { id: id! },
        query: {},
      }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateDigestScope(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DigestScopeCreateInput) =>
      unwrap(rpc.api.v1["digest-scopes"].$post({ json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(projectId) });
    },
  });
}

export function useUpdateDigestScope(id: string, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DigestScopeUpdateInput) =>
      unwrap(rpc.api.v1["digest-scopes"][":id"].$put({ param: { id }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: digestScopeKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(projectId) });
    },
  });
}

export function useArchiveDigestScope(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["digest-scopes"][":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: digestScopeKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(projectId) });
    },
  });
}
