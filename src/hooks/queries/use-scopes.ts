import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { ScopeCreateInput, ScopeUpdateInput, ScopeBatchInput } from "@/lib/schemas/scope";
import { srsKeys } from "@/hooks/queries/use-srs";
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
  timeline: (id: string) => [...scopesKeys.all, "timeline", id] as const,
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

export type ScopeTimeline = RpcData<typeof rpc.api.v1.scopes[":id"]["timeline"]["$get"]>["data"];

export function useScopeTimeline(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.timeline(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].timeline.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

/**
 * Timeline から asOf 時点の active rows を選び、ScopeDetail と互換 shape の
 * {scope, layers, milestones} に整形する。asOf=null なら live (latest active)。
 *
 * - scope: vf <= asOf < (vt ?? ∞) を満たす最新 revision (なければ latest)
 * - layers/milestones: 同条件 + is_active=true、id ごとに 1 行 (最新 revision)
 *
 * pure 関数。useMemo の中で呼ぶ前提。
 */
export function sliceTimelineAtAsOf(
  timeline: ScopeTimeline,
  asOf: string | null,
): {
  scope: ScopeTimeline["scope_revisions"][number] | null;
  layers: ScopeTimeline["layer_revisions"];
  milestones: ScopeTimeline["milestone_revisions"];
} {
  if (!asOf) {
    const liveScope = timeline.scope_revisions.find((r) => !r.valid_to && r.is_active)
      ?? timeline.scope_revisions[0] ?? null;
    const liveLayers = timeline.layer_revisions.filter((l) => !l.valid_to && l.is_active);
    const liveMs = timeline.milestone_revisions.filter((m) => !m.valid_to && m.is_active);
    return { scope: liveScope, layers: liveLayers, milestones: liveMs };
  }
  // asOf は YYYY-MM-DD。day end (23:59:59 UTC) で比較すると drag 中も粒度が荒れない。
  const asOfMs = new Date(`${asOf}T23:59:59Z`).getTime();
  const within = (vf: string, vt: string | null) => {
    const vfMs = new Date(vf).getTime();
    if (vfMs > asOfMs) return false;
    if (!vt) return true;
    return asOfMs < new Date(vt).getTime();
  };
  const scopeAt = timeline.scope_revisions
    .filter((r) => within(r.valid_from, r.valid_to))
    .sort((a, b) => b.revision - a.revision)[0]
    ?? timeline.scope_revisions[0] ?? null;
  // layers/milestones は id ごとに asOf 時点の revision を選び、その時点で is_active なら残す
  const pickLatestById = <T extends { id: string; revision: number; valid_from: string; valid_to: string | null; is_active: boolean }>(rows: T[]): T[] => {
    const byId = new Map<string, T>();
    for (const r of rows) {
      if (!within(r.valid_from, r.valid_to)) continue;
      const prev = byId.get(r.id);
      if (!prev || prev.revision < r.revision) byId.set(r.id, r);
    }
    return [...byId.values()].filter((r) => r.is_active);
  };
  return {
    scope: scopeAt,
    layers: pickLatestById(timeline.layer_revisions),
    milestones: pickLatestById(timeline.milestone_revisions),
  };
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
      qc.invalidateQueries({ queryKey: scopesKeys.timeline(vars.id) });
      // filter 変更で member 集合が変わる → review / problems のクエリも fresh に
      qc.invalidateQueries({ queryKey: srsKeys.all });
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
      qc.invalidateQueries({ queryKey: scopesKeys.timeline(scopeId) });
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
