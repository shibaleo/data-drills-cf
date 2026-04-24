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
      // Server emits `name`, `subject_id`, `level_id` as non-null strings
      // (via `?? ""`). Normalize payload nullables to match when merging
      // into the cache, so types stay consistent.
      const patch: Partial<ProblemWithAnswers> = {};
      if (payload.code !== undefined) patch.code = payload.code;
      if (payload.name !== undefined) patch.name = payload.name ?? "";
      if (payload.checkpoint !== undefined) patch.checkpoint = payload.checkpoint ?? null;
      if (payload.subject_id !== undefined) patch.subject_id = payload.subject_id ?? "";
      if (payload.level_id !== undefined) patch.level_id = payload.level_id ?? "";
      if (payload.topic_id !== undefined) patch.topic_id = payload.topic_id ?? null;
      if (payload.standard_time !== undefined) patch.standard_time = payload.standard_time ?? null;
      qc.setQueryData<ProblemWithAnswers[]>(key, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
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
