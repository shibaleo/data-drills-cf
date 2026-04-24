import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { ProblemUpdateInput } from "@/lib/schemas/problem";

/** Server-resolved problem row with nested answers/reviews/files. */
export type ProblemWithAnswers = RpcData<typeof rpc.api.v1["problems-list"]["$get"]>["data"][number];
export type AnswerWithReviews = ProblemWithAnswers["answers"][number];

export const problemsKeys = {
  all: ["problems"] as const,
  list: (projectId: string) => [...problemsKeys.all, "list", projectId] as const,
};

export function useProblemsList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? problemsKeys.list(projectId) : problemsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1["problems-list"].$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useDeleteProblem(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.problems[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: problemsKeys.list(projectId) });
    },
  });
}

/** Map a snake_case `ProblemUpdateInput` field to its snake_case mirror
 * on the `problems-list` response row (for optimistic cache updates). */
const UPDATE_TO_ROW_KEY: Record<keyof ProblemUpdateInput, keyof ProblemWithAnswers> = {
  code: "code",
  name: "name",
  checkpoint: "checkpoint",
  subject_id: "subject_id",
  level_id: "level_id",
  topic_id: "subject_id", // problems-list row doesn't expose topic_id; fallback no-op key
  standard_time: "standard_time",
};

export function useUpdateProblem(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: ProblemUpdateInput }) =>
      unwrap(
        rpc.api.v1.problems[":id"].$put({
          param: { id: vars.id },
          json: vars.payload,
        }),
      ),
    onMutate: async ({ id, payload }) => {
      if (!projectId) return;
      const key = problemsKeys.list(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProblemWithAnswers[]>(key);
      qc.setQueryData<ProblemWithAnswers[]>(key, (old) =>
        old?.map((p) => {
          if (p.id !== id) return p;
          const patch: Partial<ProblemWithAnswers> = {};
          for (const k of Object.keys(payload) as (keyof ProblemUpdateInput)[]) {
            const rowKey = UPDATE_TO_ROW_KEY[k];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (patch as any)[rowKey] = payload[k];
          }
          return { ...p, ...patch };
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!projectId || !ctx?.previous) return;
      qc.setQueryData(problemsKeys.list(projectId), ctx.previous);
    },
    onSettled: () => {
      if (projectId) qc.invalidateQueries({ queryKey: problemsKeys.list(projectId) });
    },
  });
}
