import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { fieldKeys } from "@/hooks/queries/use-field-data";

export type StatusItem = RpcData<typeof rpc.api.v1.statuses.$get>["data"][number];

export const statusesKeys = {
  all: ["statuses"] as const,
  list: () => [...statusesKeys.all, "list"] as const,
};

export function useStatusesList() {
  return useQuery({
    queryKey: statusesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.statuses.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: statusesKeys.list() });
  qc.invalidateQueries({ queryKey: fieldKeys.statuses() });
}

/** stability_days のみ更新可。他のフィールド (name/color/sort_order 等) は UI から触れない。 */
export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: { stability_days: number } }) =>
      unwrap(rpc.api.v1.statuses[":id"].$put({ param: { id: vars.id }, json: vars.payload })),
    onSuccess: () => invalidateAll(qc),
  });
}
