import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type {
  ReviewScopeCreateInput,
  ReviewScopeUpdateInput,
} from "@/lib/schemas/review-scope";

export type ReviewScopeRow = RpcData<typeof rpc.api.v1["review-scopes"]["$get"]>["data"][number];
export type ReviewScopeDetail = RpcData<typeof rpc.api.v1["review-scopes"][":id"]["$get"]>["data"];
export type ReviewScopeMember = ReviewScopeDetail["members"][number];

export const reviewScopeKeys = {
  all: ["review-scopes"] as const,
  list: (fieldId: string) => [...reviewScopeKeys.all, "list", fieldId] as const,
  detail: (id: string) => [...reviewScopeKeys.all, "detail", id] as const,
};

export function useReviewScopesList(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? reviewScopeKeys.list(fieldId) : reviewScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["review-scopes"].$get({ query: { field_id: fieldId! } }));
      return json.data;
    },
    enabled: !!fieldId,
  });
}

export function useReviewScope(id: string | undefined, asOf?: string | null) {
  return useQuery({
    queryKey: id ? [...reviewScopeKeys.detail(id), { asOf: asOf ?? null }] : reviewScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["review-scopes"][":id"].$get({
        param: { id: id! },
        query: asOf ? { as_of: asOf } : {},
      }));
      return json.data;
    },
    enabled: !!id,
  });
}

export type ReviewScopeRevisionEntry = RpcData<typeof rpc.api.v1["review-scopes"][":id"]["revisions"]["$get"]>["data"][number];

export function useReviewScopeRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? [...reviewScopeKeys.detail(id), "revisions"] : reviewScopeKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["review-scopes"][":id"].revisions.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

export function useCreateReviewScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReviewScopeCreateInput) =>
      unwrap(rpc.api.v1["review-scopes"].$post({ json: payload })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: reviewScopeKeys.list(fieldId) });
    },
  });
}

export function useUpdateReviewScope(id: string, fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReviewScopeUpdateInput) =>
      unwrap(rpc.api.v1["review-scopes"][":id"].$put({ param: { id }, json: payload })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reviewScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: reviewScopeKeys.list(fieldId) });
    },
  });
}

export function useArchiveReviewScope(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["review-scopes"][":id"].$delete({ param: { id } })),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: reviewScopeKeys.detail(id) });
      if (fieldId) qc.invalidateQueries({ queryKey: reviewScopeKeys.list(fieldId) });
    },
  });
}
