import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitRow = RpcData<typeof rpc.api.v1.habits["$get"]>["data"][number];

type HabitCreatePayload = {
  name: string;
  cadence: "daily" | "weekly";
  toggl_project: string;
  toggl_description: string;
  category_color: string;
  minutes_estimate?: number;
  sort_order?: number;
  is_active?: boolean;
};

type HabitUpdatePayload = Partial<HabitCreatePayload>;

export const habitsKeys = {
  all: ["habits"] as const,
  list: () => [...habitsKeys.all, "list"] as const,
};

export function useHabits() {
  return useQuery({
    queryKey: habitsKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.habits.$get());
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: HabitCreatePayload) =>
      unwrap(rpc.api.v1.habits.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKeys.list() }),
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: HabitUpdatePayload }) =>
      unwrap(rpc.api.v1.habits[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKeys.list() }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.habits[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitsKeys.list() }),
  });
}

export function useReorderHabits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(rpc.api.v1.habits.reorder.$patch({ json: { ids } })),
    onSettled: () => qc.invalidateQueries({ queryKey: habitsKeys.list() }),
  });
}
