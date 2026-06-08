import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ReviewTypeRow = RpcData<typeof rpc.api.v1["review-types"]["$get"]>["data"][number];

export const reviewTypesKeys = {
  all: ["review-types"] as const,
  list: () => [...reviewTypesKeys.all, "list"] as const,
};

export function useReviewTypes() {
  return useQuery({
    queryKey: reviewTypesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["review-types"].$get());
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateReviewType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code?: string; name: string; color?: string | null; sort_order?: number }) =>
      unwrap(rpc.api.v1["review-types"].$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewTypesKeys.list() }),
  });
}

export function useUpdateReviewType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { code?: string; name?: string; color?: string | null; sort_order?: number } }) =>
      unwrap(rpc.api.v1["review-types"][":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewTypesKeys.list() }),
  });
}

export function useDeleteReviewType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1["review-types"][":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewTypesKeys.list() }),
  });
}

export function useReorderReviewTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(rpc.api.v1["review-types"].reorder.$patch({ json: { ids } })),
    onSettled: () => qc.invalidateQueries({ queryKey: reviewTypesKeys.list() }),
  });
}
