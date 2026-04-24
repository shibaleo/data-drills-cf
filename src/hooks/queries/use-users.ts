import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type UserRow = RpcData<typeof rpc.api.v1.users.$get>["data"][number];

export const usersKeys = {
  all: ["users"] as const,
  list: () => [...usersKeys.all, "list"] as const,
};

export function useUsersList() {
  return useQuery({
    queryKey: usersKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.users.$get());
      return json.data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; name: string }) =>
      unwrap(rpc.api.v1.users.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.list() }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.users[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.list() }),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.users[":id"].activate.$post({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.list() }),
  });
}

export function useSetUserPassword() {
  return useMutation({
    mutationFn: (vars: { id: string; password: string }) =>
      unwrap(
        rpc.api.v1.users[":id"].password.$post({
          param: { id: vars.id },
          json: { password: vars.password },
        }),
      ),
  });
}
