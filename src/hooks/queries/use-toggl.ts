import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TogglEntry = RpcData<typeof rpc.api.v1.toggl["time-entries"]["$get"]>["data"][number];
export type TogglCategory = RpcData<typeof rpc.api.v1.toggl.categories["$get"]>["data"][number];

export const togglKeys = {
  all: ["toggl"] as const,
  entries: (from: string, to: string, category?: string | null) =>
    [...togglKeys.all, "entries", from, to, category ?? null] as const,
  categories: () => [...togglKeys.all, "categories"] as const,
};

/** Toggl personal_category 一覧 (DWH の dim_category_time_personal)。digest tab の master。 */
export function useTogglCategories() {
  return useQuery({
    queryKey: togglKeys.categories(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.toggl.categories.$get());
      return json.data;
    },
    staleTime: 60 * 60_000, // master データなので 1 時間
  });
}

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
    meta: { persist: true },
  });
}
