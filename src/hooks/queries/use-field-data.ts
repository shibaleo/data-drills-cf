import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

// Field CRUD + subjects/levels/statuses lookup hooks。
// Phase 3c.2 で /api/v1/projects → /api/v1/fields に透過スワップ済。
// 旧 use-fields.ts は同等機能のため Phase で削除、ここに統合。
export type Field = RpcData<typeof rpc.api.v1.fields.$get>["data"][number];
/** consumer 互換のため旧名 Project を Field の alias として残す。 */
export type Project = Field;
export type LookupItem = RpcData<typeof rpc.api.v1.projects[":id"]["subjects"]["$get"]>["data"][number];
export type StatusItem = RpcData<typeof rpc.api.v1.statuses.$get>["data"][number];

export const fieldKeys = {
  all: ["field-data"] as const,
  fields: () => [...fieldKeys.all, "fields"] as const,
  subjects: (fieldId: string) => [...fieldKeys.all, "subjects", fieldId] as const,
  levels: (fieldId: string) => [...fieldKeys.all, "levels", fieldId] as const,
  statuses: () => [...fieldKeys.all, "statuses"] as const,
};

export function useFields() {
  return useQuery({
    queryKey: fieldKeys.fields(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.fields.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSubjects(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? fieldKeys.subjects(fieldId) : fieldKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].subjects.$get({ param: { id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
    staleTime: 5 * 60_000,
  });
}

export function useLevels(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? fieldKeys.levels(fieldId) : fieldKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].levels.$get({ param: { id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
    staleTime: 5 * 60_000,
  });
}

export function useStatuses() {
  return useQuery({
    queryKey: fieldKeys.statuses(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.statuses.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateFieldData() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: fieldKeys.all });
  }, [qc]);
}

/* ── Field mutations ── */

export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; name: string; color?: string | null }) =>
      unwrap(rpc.api.v1.fields.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.fields() }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(rpc.api.v1.fields[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.fields() }),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.fields[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.fields() }),
  });
}

export function useReorderFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1.fields.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: fieldKeys.fields() });
      const previous = qc.getQueryData<Field[]>(fieldKeys.fields());
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          fieldKeys.fields(),
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(fieldKeys.fields(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fieldKeys.fields() }),
  });
}
