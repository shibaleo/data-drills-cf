import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type SleepStage = RpcData<typeof rpc.api.v1.sleep.stages["$get"]>["data"][number];

export const sleepKeys = {
  all: ["sleep"] as const,
  stages: (from: string, to: string) => [...sleepKeys.all, "stages", from, to] as const,
};

/**
 * Neon DWH の Google Health sleep stages を JST sleep_date 範囲で引く。
 * 各 stage = { type: AWAKE|LIGHT|DEEP|REM..., start_at, end_at } の flat list。
 */
export function useSleepStages(from: string | undefined, to: string | undefined) {
  const enabled = !!from && !!to;
  return useQuery({
    queryKey: enabled ? sleepKeys.stages(from!, to!) : sleepKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.sleep.stages.$get({ query: { from: from!, to: to! } }));
      return json.data;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
