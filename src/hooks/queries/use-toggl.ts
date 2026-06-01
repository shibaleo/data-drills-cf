import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TogglEntry = RpcData<typeof rpc.api.v1.toggl["time-entries"]["$get"]>["data"][number];

export const togglKeys = {
  all: ["toggl"] as const,
  entries: (from: string, to: string, category?: string | null) =>
    [...togglKeys.all, "entries", from, to, category ?? null] as const,
};

/**
 * Neon DWH の Toggl time entries を JST 日付範囲で引く。
 * `from`/`to` は inclusive。category 省略時は全 personal_category 含む。
 */
export function useTogglEntries(
  from: string | undefined,
  to: string | undefined,
  category?: string | null,
) {
  const enabled = !!from && !!to;
  return useQuery({
    queryKey: enabled ? togglKeys.entries(from!, to!, category) : togglKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.toggl["time-entries"].$get({
          query: category
            ? { from: from!, to: to!, category }
            : { from: from!, to: to! },
        }),
      );
      return json.data;
    },
    enabled,
    // DWH は数分単位の集計バッチで更新。digest 切替で頻繁に refetch 不要。
    staleTime: 60 * 1000,
  });
}
