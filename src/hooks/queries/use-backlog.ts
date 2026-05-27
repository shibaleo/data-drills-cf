import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  BacklogCreateInput,
  BacklogUpdateInput,
  GoalLayerCreateInput,
  GoalLayerUpdateInput,
  GoalLayerReorderInput,
  GoalMilestoneCreateInput,
  GoalMilestoneUpdateInput,
} from "@/lib/schemas/backlog";

export type BacklogRow = RpcData<typeof rpc.api.v1.backlog.$get>["data"][number];
export type BacklogDetail = RpcData<typeof rpc.api.v1.backlog[":id"]["$get"]>["data"];
export type BacklogMember = BacklogDetail["members"][number];
export type GoalLayerRow = BacklogDetail["layers"][number];
export type GoalMilestoneRow = BacklogDetail["milestones"][number];

export const backlogKeys = {
  all: ["backlog"] as const,
  list: (projectId: string) => [...backlogKeys.all, "list", projectId] as const,
  detail: (backlogId: string) => [...backlogKeys.all, "detail", backlogId] as const,
};

export function useBacklogTodayCount(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? [...backlogKeys.all, "today-count", projectId] : backlogKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.backlog["today-count"].$get({ query: { project_id: projectId! } }));
      return json.data.count;
    },
    enabled: !!projectId,
  });
}

export function useBacklogList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? backlogKeys.list(projectId) : backlogKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.backlog.$get({ query: { project_id: projectId! } }));
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useBacklog(backlogId: string | undefined) {
  return useQuery({
    queryKey: backlogId ? backlogKeys.detail(backlogId) : backlogKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.backlog[":id"].$get({ param: { id: backlogId! } }));
      return json.data;
    },
    enabled: !!backlogId,
  });
}

export function useCreateBacklog(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BacklogCreateInput) =>
      unwrap(rpc.api.v1.backlog.$post({ json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: backlogKeys.list(projectId) });
    },
  });
}

export function useUpdateBacklog(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: BacklogUpdateInput }) =>
      unwrap(rpc.api.v1.backlog[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: backlogKeys.detail(vars.id) });
      if (projectId) qc.invalidateQueries({ queryKey: backlogKeys.list(projectId) });
    },
  });
}

export function useArchiveBacklog(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.backlog[":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: backlogKeys.detail(id) });
      if (projectId) qc.invalidateQueries({ queryKey: backlogKeys.list(projectId) });
    },
  });
}

/* ── Goal Layer mutations ───────────────────────────────────── */

export function useCreateGoalLayer(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GoalLayerCreateInput) =>
      unwrap(rpc.api.v1.backlog.layers.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
export function useUpdateGoalLayer(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: GoalLayerUpdateInput }) =>
      unwrap(rpc.api.v1.backlog.layers[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
export function useDeleteGoalLayer(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.backlog.layers[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
export function useReorderGoalLayers(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GoalLayerReorderInput) =>
      unwrap(rpc.api.v1.backlog.layers.reorder.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}

/* ── Goal Milestone mutations ───────────────────────────────── */

export function useCreateGoalMilestone(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GoalMilestoneCreateInput) =>
      unwrap(rpc.api.v1.backlog.milestones.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
export function useUpdateGoalMilestone(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: GoalMilestoneUpdateInput }) =>
      unwrap(rpc.api.v1.backlog.milestones[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
export function useDeleteGoalMilestone(backlogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.backlog.milestones[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: backlogKeys.detail(backlogId) }),
  });
}
