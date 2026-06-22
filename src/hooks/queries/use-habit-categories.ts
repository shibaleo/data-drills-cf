import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitCategoryRow = RpcData<typeof rpc.api.v1["habit-categories"]["$get"]>["data"][number];

type HabitCategoryCreatePayload = {
  name: string;
  sort_order?: number;
};

type HabitCategoryUpdatePayload = Partial<HabitCategoryCreatePayload>;

export const habitCategoriesKeys = {
  all: ["habit-categories"] as const,
  list: () => [...habitCategoriesKeys.all, "list"] as const,
};

export function useHabitCategories() {
  return useQuery({
    queryKey: habitCategoriesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["habit-categories"].$get());
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateHabitCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: HabitCategoryCreatePayload) =>
      unwrap(rpc.api.v1["habit-categories"].$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitCategoriesKeys.list() }),
  });
}

export function useUpdateHabitCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: HabitCategoryUpdatePayload }) =>
      unwrap(rpc.api.v1["habit-categories"][":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitCategoriesKeys.list() }),
  });
}

export function useDeleteHabitCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["habit-categories"][":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitCategoriesKeys.list() }),
  });
}

export function useReorderHabitCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(rpc.api.v1["habit-categories"].reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: habitCategoriesKeys.list() });
      const prev = qc.getQueryData<HabitCategoryRow[]>(habitCategoriesKeys.list());
      if (prev) {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const reordered = ids.map((id, i) => {
          const c = byId.get(id);
          return c ? { ...c, sortOrder: i } : null;
        }).filter((x): x is HabitCategoryRow => x !== null);
        qc.setQueryData<HabitCategoryRow[]>(habitCategoriesKeys.list(), reordered);
      }
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(habitCategoriesKeys.list(), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: habitCategoriesKeys.list() }),
  });
}
