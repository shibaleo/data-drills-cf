import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type StrengthSession = RpcData<typeof rpc.api.v1.exercise.sessions["$get"]>["data"][number];

export const exerciseKeys = {
  all: ["exercise"] as const,
  sessions: (from: string, to: string) => [...exerciseKeys.all, "sessions", from, to] as const,
};

export function useExerciseSessions(from: string | undefined, to: string | undefined) {
  const enabled = !!from && !!to;
  return useQuery({
    queryKey: enabled ? exerciseKeys.sessions(from!, to!) : exerciseKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.exercise.sessions.$get({ query: { from: from!, to: to! } }));
      return json.data;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
