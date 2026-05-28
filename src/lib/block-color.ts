/**
 * Tetris ブロック (= 1 問 / 1 answer) の色決定ロジック。
 *
 * 着色軸:
 *  - 過去側 (= 完了): 初回は紫、2回目以降はその回答の「直前 answer」の status color
 *  - 未来側 (= 配分): 通常は青、daily 枠の予算オーバー単問は黄、milestone pile-up は赤
 *
 * Throughput / Backlog 両 chart で共通利用するためモジュール化。
 */

export const COLOR_FIRST_ATTEMPT = "#a855f7";  // 紫 = answer_status で未使用 (=初回)
export const COLOR_FUTURE_PLANNED = "#3b82f6"; // 青
export const COLOR_OVER_BUDGET = "#eab308";    // 黄
export const COLOR_OVERFLOW = "#ef4444";       // 赤

export type BlockKind =
  | { side: "past"; prevStatusColor: string | null }
  | { side: "future"; overflow: boolean; overBudget: boolean };

export function blockColor(kind: BlockKind): string {
  if (kind.side === "past") {
    return kind.prevStatusColor ?? COLOR_FIRST_ATTEMPT;
  }
  if (kind.overflow) return COLOR_OVERFLOW;
  if (kind.overBudget) return COLOR_OVER_BUDGET;
  return COLOR_FUTURE_PLANNED;
}
