import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap } from "@/lib/rpc-client";

export const filterPrefsKeys = {
  all: ["filter-prefs"] as const,
  byProject: (projectId: string) => [...filterPrefsKeys.all, projectId] as const,
};

export type ReviewPrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  /** 最終回答 status (= 各問題の現在ステータス) でフィルタ */
  lastStatuses?: string[];
};
export type BacklogPrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  topicIds?: string[];
  /** First (初回着手済み) を非表示 */
  hideFirst?: boolean;
  /** Planned (未着手) を非表示 */
  hideFuture?: boolean;
  overflowOnly?: boolean;
};
export type ThroughputPrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  prevStatuses?: string[];  // 凡例ショートカット用 ("First" + 各 status name)
  maxRowsCap?: number | null;
};
export type FilterPrefsBag = {
  review?: ReviewPrefs;
  backlog?: BacklogPrefs;
  throughput?: ThroughputPrefs;
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
