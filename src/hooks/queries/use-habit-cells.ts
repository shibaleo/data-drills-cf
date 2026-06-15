import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitFreshResponse = RpcData<typeof rpc.api.v1["habit-fresh"]["$get"]>;
export type HabitCell = HabitFreshResponse["data"][number];

export const habitCellsKeys = {
  all: ["habit-fresh"] as const,
  list: () => [...habitCellsKeys.all, "list"] as const,
};

/**
 * Worker `/api/v1/habit-fresh` から warehouse JOIN 由来の cells を取得。
 *
 * staleTime は 5 分。手動 sync button からは invalidate で再取得する。
 * 真の "今すぐ最新" を出すには Toggl on-demand fetch が必要だが、現状は
 * warehouse の GAS hourly sync 経由 (max 1h-stale) で動作。
 */
export function useHabitCells() {
  return useQuery({
    queryKey: habitCellsKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["habit-fresh"].$get());
      return json;
    },
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateHabitCells() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: habitCellsKeys.list() });
}
