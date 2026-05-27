import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  PlanCreateInput,
  PlanUpdateInput,
  LayerCreateInput,
  LayerUpdateInput,
  LayerReorderInput,
  MilestoneCreateInput,
  MilestoneUpdateInput,
} from "@/lib/schemas/plan";

export type PlanRow = RpcData<typeof rpc.api.v1.plans.$get>["data"][number];
export type PlanDetail = RpcData<typeof rpc.api.v1.plans[":id"]["$get"]>["data"];
export type PlanMember = PlanDetail["members"][number];
export type PlanLayerRow = PlanDetail["layers"][number];
export type PlanMilestoneRow = PlanDetail["milestones"][number];

export const plansKeys = {
  all: ["plans"] as const,
  list: (projectId: string) => [...plansKeys.all, "list", projectId] as const,
  detail: (planId: string) => [...plansKeys.all, "detail", planId] as const,
};

export function usePlanTodayCount(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? [...plansKeys.all, "today-count", projectId] : plansKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.plans["today-count"].$get({ query: { project_id: projectId! } }));
      return json.data.count;
    },
    enabled: !!projectId,
  });
}

export function usePlansList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? plansKeys.list(projectId) : plansKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.plans.$get({ query: { project_id: projectId! } }));
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: planId ? plansKeys.detail(planId) : plansKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.plans[":id"].$get({ param: { id: planId! } }));
      return json.data;
    },
    enabled: !!planId,
  });
}

export function useCreatePlan(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlanCreateInput) =>
      unwrap(rpc.api.v1.plans.$post({ json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: plansKeys.list(projectId) });
    },
  });
}

export function useUpdatePlan(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: PlanUpdateInput }) =>
      unwrap(rpc.api.v1.plans[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: plansKeys.detail(vars.id) });
      if (projectId) qc.invalidateQueries({ queryKey: plansKeys.list(projectId) });
    },
  });
}

export function useArchivePlan(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.plans[":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: plansKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: plansKeys.list(projectId) });
    },
  });
}

/* ── Layer mutations ────────────────────────────────────────── */

export function useCreateLayer(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LayerCreateInput) =>
      unwrap(rpc.api.v1.plans.layers.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
export function useUpdateLayer(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: LayerUpdateInput }) =>
      unwrap(rpc.api.v1.plans.layers[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
export function useDeleteLayer(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.plans.layers[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
export function useReorderLayers(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LayerReorderInput) =>
      unwrap(rpc.api.v1.plans.layers.reorder.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}

/* ── Milestone mutations ─────────────────────────────────────── */

export function useCreateMilestone(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MilestoneCreateInput) =>
      unwrap(rpc.api.v1.plans.milestones.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
export function useUpdateMilestone(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: MilestoneUpdateInput }) =>
      unwrap(rpc.api.v1.plans.milestones[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
export function useDeleteMilestone(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.plans.milestones[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKeys.detail(planId) }),
  });
}
