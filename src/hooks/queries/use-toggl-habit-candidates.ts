import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type HabitCandidate = RpcData<typeof rpc.api.v1.toggl["habit-candidates"]["$get"]>["data"][number];

export const togglHabitCandidatesKeys = {
  all: ["toggl-habit-candidates"] as const,
  list: () => [...togglHabitCandidatesKeys.all, "list"] as const,
};

/**
 * Toggl の (project_name, description) 候補一覧。
 * 過去 90 日のヒット数で並ぶ。habit 登録 dialog の cascading select に使う。
 */
export function useTogglHabitCandidates() {
  return useQuery({
    queryKey: togglHabitCandidatesKeys.list(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.toggl["habit-candidates"].$get());
      return json.data;
    },
    staleTime: 10 * 60_000,  // 10 min。Toggl の master が頻繁に変わるわけではない
  });
}
