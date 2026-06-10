import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap } from "@/lib/rpc-client";

export const filterPrefsKeys = {
  all: ["filter-prefs"] as const,
  byField: (fieldId: string) => [...filterPrefsKeys.all, fieldId] as const,
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
  /** ユーザーが目隠ししたレイヤ id (eye toggle) */
  hiddenLayerIds?: string[];
};
export type ThroughputPrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  prevStatuses?: string[];  // 凡例ショートカット用 ("First" + 各 status name)
  maxRowsCap?: number | null;
};
export type PlanPrefs = {
  subjectIds?: string[];
  levelIds?: string[];
  lastStatuses?: string[];
  /** 凡例の First / Planned 選択 (select-only: 空=全表示) */
  allocKinds?: ("First" | "Planned")[];
  /** 凡例の overflow / overBudget リング選択 (select-only) */
  allocFlags?: ("overflow" | "overBudget")[];
  hiddenLayerIds?: string[];
  /** Tetris 最大段数 (null = full/auto)。 */
  chartMaxRows?: number | null;
  /** 過去 throughput overlay + alloc.past を隠す。 */
  hideThroughput?: boolean;
  /** Review-next overlay (1 entry/problem) を隠す。 */
  hideReview?: boolean;
  /** Smooth-future overlay + alloc.future を隠す。 */
  hideForecast?: boolean;
};
export type FilterPrefsBag = {
  review?: ReviewPrefs;
  backlog?: BacklogPrefs;
  throughput?: ThroughputPrefs;
  plan?: PlanPrefs;
};

export function useFilterPrefs(fieldId: string | undefined) {
  return useQuery({
    queryKey: fieldId ? filterPrefsKeys.byField(fieldId) : filterPrefsKeys.all,
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["filter-prefs"].$get({ query: { field_id: fieldId! } }));
      return (json.data?.filters ?? {}) as FilterPrefsBag;
    },
    enabled: !!fieldId,
  });
}

export function useSaveFilterPrefs(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters: FilterPrefsBag) =>
      unwrap(rpc.api.v1["filter-prefs"].$put({ json: { field_id: fieldId!, filters } })),
    onSuccess: (_data, filters) => {
      // server を round-trip せず cache を直接更新 (= 無駄な GET を抑える)
      if (fieldId) qc.setQueryData(filterPrefsKeys.byField(fieldId), filters);
    },
  });
}
