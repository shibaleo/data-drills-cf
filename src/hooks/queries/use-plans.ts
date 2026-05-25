import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { PlanCreateInput, PlanUpdateInput } from "@/lib/schemas/plan";

export type PlanRow = RpcData<typeof rpc.api.v1.plans.$get>["data"][number];
export type PlanDetail = RpcData<typeof rpc.api.v1.plans[":id"]["$get"]>["data"];
export type PlanMember = PlanDetail["members"][number];

export const plansKeys = {
  all: ["plans"] as const,
  list: (projectId: string) => [...plansKeys.all, "list", projectId] as const,
  detail: (planId: string) => [...plansKeys.all, "detail", planId] as const,
};

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
