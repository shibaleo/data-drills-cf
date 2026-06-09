import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  ThroughputScopeCreateInput,
  ThroughputScopeUpdateInput,
} from "@/lib/schemas/throughput-scope";

export type ThroughputScopeRow = RpcData<typeof rpc.api.v1["throughput-scopes"]["$get"]>["data"][number];
export type ThroughputScopeDetail = RpcData<typeof rpc.api.v1["throughput-scopes"][":id"]["$get"]>["data"];

export const throughputScopeKeys = {
  all: ["throughput-scopes"] as const,
  list: (fieldId: string | null) => [...throughputScopeKeys.all, "list", fieldId] as const,
  detail: (id: string) => [...throughputScopeKeys.all, "detail", id] as const,
};

export function useThroughputScopesList(fieldId?: string | undefined) {
  return useQuery({
    queryKey: throughputScopeKeys.list(fieldId ?? null),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["throughput-scopes"].$get({ query: fieldId ? { field_id: fieldId } : {} }));
      return json.data;
    },
  });
}

export function useThroughputScope(id: string | undefined) {
  return useQuery({
    queryKey: id ? throughputScopeKeys.detail(id) : throughputScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["throughput-scopes"][":id"].$get({
        param: { id: id! },
        query: {},
      }));
      return json.data;
    },
    enabled: !!id,
  });
}

export type ThroughputScopeRevisionEntry = RpcData<typeof rpc.api.v1["throughput-scopes"][":id"]["revisions"]["$get"]>["data"][number];

export function useThroughputScopeRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? [...throughputScopeKeys.detail(id), "revisions"] : throughputScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["throughput-scopes"][":id"].revisions.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateThroughputScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ThroughputScopeCreateInput) =>
      unwrap(rpc.api.v1["throughput-scopes"].$post({ json: payload })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: throughputScopeKeys.list(fieldId) });
    },
  });
}

export function useUpdateThroughputScope(id: string, fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ThroughputScopeUpdateInput) =>
      unwrap(rpc.api.v1["throughput-scopes"][":id"].$put({ param: { id }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: throughputScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: throughputScopeKeys.list(fieldId) });
    },
  });
}

export function useArchiveThroughputScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["throughput-scopes"][":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: throughputScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: throughputScopeKeys.list(fieldId) });
    },
  });
}
