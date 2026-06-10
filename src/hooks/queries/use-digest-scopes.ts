/**
 * Plan A 移行後の薄い wrapper (canonical /api/v1/scopes/:id/... 経由)。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { ScopeUpdateInput } from "@/lib/schemas/scope";
import { scopesKeys } from "@/hooks/queries/use-scopes";

type CanonicalDetail = RpcData<typeof rpc.api.v1.scopes[":id"]["detail"]["$get"]>["data"];

export type DigestScopeDetail = ReturnType<typeof adaptDetail>;

function adaptDetail(d: CanonicalDetail) {
  const fieldIds = d.scope.filter?.fieldIds;
  const derivedFieldId = fieldIds && fieldIds.length > 0 ? fieldIds[0] : null;
  return {
    scope: {
      ...d.scope,
      field_id: derivedFieldId,
      scope_id: d.scope.id,
    },
    members: d.members,
    subjects: d.subjects,
    levels: d.levels,
  };
}

export function useDigestScope(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.fullDetail(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].detail.$get({ param: { id: id! } }));
      return adaptDetail(json.data);
    },
    enabled: !!id,
  });
}

export type DigestScopeRevisionEntry = RpcData<typeof rpc.api.v1.scopes[":id"]["history"]["$get"]>["data"][number];

export function useDigestScopeRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? scopesKeys.history(id) : scopesKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.scopes[":id"].history.$get({ param: { id: id! } }));
      return json.data;
    },
    enabled: !!id,
  });
}

type LegacyUpdateInput = ScopeUpdateInput & { scope_id?: string | null };

export function useUpdateDigestScope(id: string, _fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LegacyUpdateInput) => {
      const { scope_id: _ignored, ...rest } = payload;
      return unwrap(rpc.api.v1.scopes[":id"].$put({ param: { id }, json: rest }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scopesKeys.fullDetail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
      qc.invalidateQueries({ queryKey: scopesKeys.revisions(id) });
    },
  });
}

export function useArchiveDigestScope(_fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.scopes[":id"].$delete({ param: { id } })),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: scopesKeys.fullDetail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.detail(id) });
      qc.invalidateQueries({ queryKey: scopesKeys.list() });
    },
  });
}
