import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import { problemsKeys, type ProblemWithAnswers } from "@/hooks/queries/use-problems";

export type AnswerListRow = RpcData<typeof rpc.api.v1["answers-list"]["$get"]>["data"][number];

export const answersKeys = {
  all: ["answers"] as const,
  list: (projectId: string) => [...answersKeys.all, "list", projectId] as const,
};

export function useAnswersList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? answersKeys.list(projectId) : answersKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1["answers-list"].$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

/** Bundled query: answers-list + problems-list, invalidated together. */
export function useAnswersPageData(projectId: string | undefined) {
  const answers = useAnswersList(projectId);
  const problems = useQuery({
    queryKey: projectId ? problemsKeys.list(projectId) : problemsKeys.all,
    queryFn: async (): Promise<ProblemWithAnswers[]> => {
      const json = await unwrap(
        rpc.api.v1["problems-list"].$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
  return {
    rows: answers.data ?? [],
    problems: problems.data ?? [],
    isLoading: answers.isLoading || problems.isLoading,
  };
}

export function useDeleteAnswer(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.answers[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (!projectId) return;
      qc.invalidateQueries({ queryKey: answersKeys.list(projectId) });
      qc.invalidateQueries({ queryKey: problemsKeys.list(projectId) });
    },
  });
}
