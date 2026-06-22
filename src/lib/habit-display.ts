/**
 * habit (grouped form) を表示するための enrichment ヘルパー。
 *
 * habit 行は name + (toggl_description_patterns[]) + cadence + meta のみを持つ。
 * 色は habit-fresh ルートで「直近マッチ entry の project_color の最頻値」として
 * サーバ側で算出され、`colors: Record<habitId, string>` で配信される。
 */

import type { HabitRow } from "@/hooks/queries/use-habits";

export type HabitDisplay = {
  /** 表示ラベル = habit.name */
  label: string;
  /** category color (habit-fresh が算出。未マッチなら fallback gray) */
  color: string;
  /** 1 件あたり avg 分 (将来計算するなら埋める) */
  avgMinutes: number | undefined;
};

const FALLBACK_COLOR = "#94a3b8";  // slate-400

export function displayFor(
  habit: HabitRow,
  colors: Record<string, string> | undefined,
): HabitDisplay {
  return {
    label: habit.name,
    color: colors?.[habit.id] ?? FALLBACK_COLOR,
    avgMinutes: undefined,
  };
}
