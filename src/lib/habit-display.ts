/**
 * habit (pure form) を表示するための enrichment ヘルパー。
 *
 * habit 行は (toggl_project, toggl_description) + cadence + meta のみを持つので、
 * 名前 / 色 / 所要時間といった表示用の値は warehouse 由来の `HabitCandidate[]`
 * から都度 lookup する。
 */

import type { HabitRow } from "@/hooks/queries/use-habits";
import type { HabitCandidate } from "@/hooks/queries/use-toggl-habit-candidates";

export type HabitDisplay = {
  /** 表示ラベル = toggl_description */
  label: string;
  /** category color = project_color (候補に無ければ fallback gray) */
  color: string;
  /** 1 件あたり avg 分 (候補にあれば、無ければ undefined) */
  avgMinutes: number | undefined;
};

const FALLBACK_COLOR = "#94a3b8";  // slate-400

/** (project, description) → HabitCandidate の lookup map を作る */
export function buildCandidateMap(candidates: HabitCandidate[]): Map<string, HabitCandidate> {
  const map = new Map<string, HabitCandidate>();
  for (const c of candidates) {
    if (!c.project_name || !c.description) continue;
    map.set(`${c.project_name} ${c.description}`, c);
  }
  return map;
}

/** habit 1 件を candidates と突き合わせて表示用に enrich */
export function displayFor(
  habit: HabitRow,
  candidateMap: Map<string, HabitCandidate>,
): HabitDisplay {
  const key = `${habit.togglProject} ${habit.togglDescription}`;
  const c = candidateMap.get(key);
  return {
    label: habit.togglDescription,
    color: c?.project_color ?? FALLBACK_COLOR,
    avgMinutes: undefined,  // 将来 candidates に avg_duration_seconds を載せたら埋める
  };
}
