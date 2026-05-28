/**
 * Tetris ブロック (= 1 問 / 1 answer) の色決定ロジック。
 *
 * ライフサイクル (= 塗り色のグラデーション):
 *   Planned → First → Miss → Rough → Fair → Fluent → Done
 *   violet  → pink  → red  → orange→ yellow→ green → blue
 *
 *  - Past 過去側: 初回は pink、2回目以降は直前 answer の status color
 *  - Future 未来側: 配分済は violet (Planned)
 *
 * 例外 (overflow / over-budget) は塗りではなく **枠線** で示す:
 *  - Overflow (milestone 締切超過 pile-up) → 赤 dashed border
 *  - Over budget (1問が daily 枠超過)      → amber solid border
 */

export const COLOR_PLANNED = "#8b5cf6";        // violet
export const COLOR_FIRST_ATTEMPT = "#ec4899";  // pink

const BORDER_OVERFLOW = "#ef4444";   // red
const BORDER_OVER_BUDGET = "#f59e0b"; // amber

export type BlockKind =
  | { side: "past"; prevStatusColor: string | null }
  | { side: "future"; overflow: boolean; overBudget: boolean };

export function blockColor(kind: BlockKind): string {
  if (kind.side === "past") return kind.prevStatusColor ?? COLOR_FIRST_ATTEMPT;
  return COLOR_PLANNED;
}

export type BlockBorder = { stroke: string; dashed: boolean; width: number } | null;

export function blockBorder(kind: BlockKind): BlockBorder {
  if (kind.side === "future") {
    if (kind.overflow) return { stroke: BORDER_OVERFLOW, dashed: true, width: 1.5 };
    if (kind.overBudget) return { stroke: BORDER_OVER_BUDGET, dashed: true, width: 1.5 };
  }
  return null;
}
