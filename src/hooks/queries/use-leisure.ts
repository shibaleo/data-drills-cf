import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type OrgasmEvent = RpcData<typeof rpc.api.v1.leisure["orgasm-events"]["$get"]>["data"][number];

export const leisureKeys = {
  all: ["leisure"] as const,
  orgasmEvents: (from: string, to: string) => [...leisureKeys.all, "orgasm-events", from, to] as const,
};

export function useOrgasmEvents(from: string | undefined, to: string | undefined) {
  const enabled = !!from && !!to;
  return useQuery({
    queryKey: enabled ? leisureKeys.orgasmEvents(from!, to!) : leisureKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.leisure["orgasm-events"].$get({ query: { from: from!, to: to! } }));
      return json.data;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
