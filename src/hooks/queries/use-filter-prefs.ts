import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap } from "@/lib/rpc-client";

export const filterPrefsKeys = {
  all: ["filter-prefs"] as const,
  byProject: (projectId: string) => [...filterPrefsKeys.all, projectId] as const,
};

export type SchedulePrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  statuses?: string[];
};
export type FilterPrefsBag = {
  schedule?: SchedulePrefs;
};

export function useFilterPrefs(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? filterPrefsKeys.byProject(projectId) : filterPrefsKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["filter-prefs"].$get({ query: { project_id: projectId! } }));
      return (json.data?.filters ?? {}) as FilterPrefsBag;
    },
    enabled: !!projectId,
  });
}

export function useSaveFilterPrefs(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters: FilterPrefsBag) =>
      unwrap(rpc.api.v1["filter-prefs"].$put({ json: { project_id: projectId!, filters } })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: filterPrefsKeys.byProject(projectId) });
    },
  });
}
