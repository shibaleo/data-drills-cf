import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type ApiKeyRow = RpcData<typeof rpc.api.v1["api-keys"]["$get"]>["data"][number];

export const apiKeysKeys = {
  all: ["api-keys"] as const,
  list: () => [...apiKeysKeys.all, "list"] as const,
};

export function useApiKeysList() {
  return useQuery({
    queryKey: apiKeysKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["api-keys"].$get());
      return json.data;
    },
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const json = await unwrap(rpc.api.v1["api-keys"].$post({ json: { name } }));
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["api-keys"][":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}
