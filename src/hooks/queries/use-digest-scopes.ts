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
  list: (fieldId: string) => [...digestScopeKeys.all, "list", fieldId] as const,
  detail: (id: string) => [...digestScopeKeys.all, "detail", id] as const,
};

export function useDigestScopesList(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? digestScopeKeys.list(fieldId) : digestScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["digest-scopes"].$get({ query: { field_id: fieldId! } }));
      return json.data;
    },
    enabled: !!fieldId,
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

export function useCreateDigestScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DigestScopeCreateInput) =>
      unwrap(rpc.api.v1["digest-scopes"].$post({ json: payload })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(fieldId) });
    },
  });
}

export function useUpdateDigestScope(id: string, fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DigestScopeUpdateInput) =>
      unwrap(rpc.api.v1["digest-scopes"][":id"].$put({ param: { id }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: digestScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(fieldId) });
    },
  });
}

export function useArchiveDigestScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["digest-scopes"][":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: digestScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: digestScopeKeys.list(fieldId) });
    },
  });
}
