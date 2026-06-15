import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitRow = RpcData<typeof rpc.api.v1.habits["$get"]>["data"][number];

type HabitCreatePayload = {
  cadence: "daily" | "weekly";
  toggl_project: string;
  toggl_description: string;
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
    // optimistic: 並べ替え直後に local cache を即座に並べ替えて UI 反映
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: habitsKeys.list() });
      const prev = qc.getQueryData<HabitRow[]>(habitsKeys.list());
      if (prev) {
        const byId = new Map(prev.map((h) => [h.id, h]));
        const reordered = ids.map((id, i) => {
          const h = byId.get(id);
          return h ? { ...h, sortOrder: i } : null;
        }).filter((x): x is HabitRow => x !== null);
        qc.setQueryData<HabitRow[]>(habitsKeys.list(), reordered);
      }
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(habitsKeys.list(), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: habitsKeys.list() }),
  });
}
