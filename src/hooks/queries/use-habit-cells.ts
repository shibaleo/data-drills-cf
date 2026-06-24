import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitFreshResponse = RpcData<typeof rpc.api.v1["habit-fresh"]["$get"]>;
export type HabitCell = HabitFreshResponse["data"][number];

export const habitCellsKeys = {
  all: ["habit-fresh"] as const,
  list: (pastDays?: number) => [...habitCellsKeys.all, "list", pastDays ?? null] as const,
};

/**
 * Worker `/api/v1/habit-fresh` から warehouse JOIN 由来の cells を取得。
 *
 * staleTime は 5 分。手動 sync button からは invalidate で再取得する。
 * 真の "今すぐ最新" を出すには Toggl on-demand fetch が必要だが、現状は
 * warehouse の GAS hourly sync 経由 (max 1h-stale) で動作。
 *
 * pastDays: 過去何日分まで取り出すか (default = 30、max 365)。habits ページの
 *  "+30d" ボタンで extend した時に pastDays を増やして refetch する。
 */
export function useHabitCells(pastDays?: number) {
  return useQuery({
    queryKey: habitCellsKeys.list(pastDays),
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1["habit-fresh"].$get(
          pastDays !== undefined ? { query: { past_days: String(pastDays) } } : { query: {} },
        ),
      );
      return json;
    },
    staleTime: 5 * 60_000,
    meta: { persist: true },
  });
}

export function useInvalidateHabitCells() {
  const qc = useQueryClient();
  // habitCellsKeys.all は prefix なので、pastDays 違いの cache 全部に効く
  return () => qc.invalidateQueries({ queryKey: habitCellsKeys.all });
}
