import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { ScopeCreateInput, ScopeUpdateInput, ScopeBatchInput } from "@/lib/schemas/scope";
import { reviewKeys } from "@/hooks/queries/use-review";
import { problemsKeys } from "@/hooks/queries/use-problems";

export type ScopeRow = RpcData<typeof rpc.api.v1.scopes.$get>["data"][number];
export type ScopeRevision = RpcData<typeof rpc.api.v1.scopes[":id"]["revisions"]["$get"]>["data"][number];
export type ScopeHistoryEntry = RpcData<typeof rpc.api.v1.scopes[":id"]["history"]["$get"]>["data"][number];

export const scopesKeys = {
  all: ["scopes"] as const,
  list: () => [...scopesKeys.all, "list"] as const,
  detail: (id: string) => [...scopesKeys.all, "detail", id] as const,
  fullDetail: (id: string) => [...scopesKeys.all, "full-detail", id] as const,
  revisions: (id: string) => [...scopesKeys.all, "revisions", id] as const,
  history: (id: string) => [...scopesKeys.all, "history", id] as const,
};

export type ScopeDetail = RpcData<typeof rpc.api.v1.scopes[":id"]["detail"]["$get"]>["data"];

export function useScopeDetail(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.fullDetail(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].detail.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useScopes() {
  return useQuery({
    queryKey: scopesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes.$get());
      return json.data;
    },
    staleTime: 30_000,
  });
}

export function useScope(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.detail(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useScopeRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.revisions(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].revisions.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useScopeHistory(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.history(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].history.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScopeCreateInput) =>
      unwrap(rpc.api.v1.scopes.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: scopesKeys.list() }),
  });
}

export function useUpdateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: ScopeUpdateInput }) =>
      unwrap(rpc.api.v1.scopes[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: scopesKeys.revisions(vars.id) });
      // filter 変更で member 集合が変わる → review / problems のクエリも fresh に
      qc.invalidateQueries({ queryKey: reviewKeys.all });
      qc.invalidateQueries({ queryKey: problemsKeys.all });
    },
  });
}

export function useScopeBatchSave(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScopeBatchInput) =>
      unwrap(rpc.api.v1.scopes[":id"].batch.$post({ param: { id: scopeId }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(scopeId) });
      qc.invalidateQueries({ queryKey: scopesKeys.fullDetail(scopeId) });
      qc.invalidateQueries({ queryKey: scopesKeys.revisions(scopeId) });
      qc.invalidateQueries({ queryKey: scopesKeys.history(scopeId) });
      qc.invalidateQueries({ queryKey: [...scopesKeys.all, "today-count"] });
    },
  });
}

export function useScopeTodayCount() {
  return useQuery({
    queryKey: [...scopesKeys.all, "today-count"] as const,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes["today-count"].$get());
      return json.data.count;
    },
    staleTime: 60 * 1000,
  });
}

export function useDeleteScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.scopes[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: scopesKeys.list() }),
  });
}
