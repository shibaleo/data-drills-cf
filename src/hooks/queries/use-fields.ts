import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type FieldRow = RpcData<typeof rpc.api.v1.fields.$get>["data"][number];

export const fieldsKeys = {
  all: ["fields"] as const,
  list: () => [...fieldsKeys.all, "list"] as const,
  detail: (id: string) => [...fieldsKeys.all, "detail", id] as const,
};

export function useFields() {
  return useQuery({
    queryKey: fieldsKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.fields.$get());
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useField(id: string | undefined) {
  return useQuery({
    queryKey: id ? fieldsKeys.detail(id) : fieldsKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.fields[":id"].$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code?: string; name: string; color?: string | null }) =>
      unwrap(rpc.api.v1.fields.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKeys.list() }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(rpc.api.v1.fields[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: fieldsKeys.list() });
      qc.invalidateQueries({ queryKey: fieldsKeys.detail(vars.id) });
    },
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.fields[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKeys.list() }),
  });
}

export function useReorderFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1.fields.reorder.$patch({ json: { ids } })),
    onSettled: () => qc.invalidateQueries({ queryKey: fieldsKeys.list() }),
  });
}
