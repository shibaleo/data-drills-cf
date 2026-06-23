import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type SleepStage = RpcData<typeof rpc.api.v1.sleep.stages["$get"]>["data"][number];
export type SleepSummary = RpcData<typeof rpc.api.v1.sleep.summary["$get"]>["data"];

export const sleepKeys = {
  all: ["sleep"] as const,
  stages: (from: string, to: string) => [...sleepKeys.all, "stages", from, to] as const,
  summary: (date: string) => [...sleepKeys.all, "summary", date] as const,
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
    meta: { persist: true },
  });
}

/** 当該夜の睡眠サマリ (efficiency, stage 別, HRV/RHR/呼吸数) + 7d history。 */
export function useSleepSummary(date: string | undefined) {
  const enabled = !!date;
  return useQuery({
    queryKey: enabled ? sleepKeys.summary(date!) : sleepKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.sleep.summary.$get({ query: { date: date! } }));
      return json.data;
    },
    enabled,
    staleTime: 60 * 1000,
    meta: { persist: true },
  });
}
