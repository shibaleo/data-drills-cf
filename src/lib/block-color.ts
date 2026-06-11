/**
 * Tetris ブロック (= 1 問 / 1 answer) の色決定ロジック。
 *
 * 位相 — 2 軸 (時間 × 評価):
 *   軸 A 時間   : past / future → past 側は PAST_ALPHA で沈める
 *   軸 B 評価   : prior grade なし (Planned / First, 同色) → Miss → Rough → Fair → Fluent → Solid
 *   メタ        : Over budget / Overflow は塗らず border のみ
 *
 *  - Past 過去側: 直前 answer の status color。初回 (= 直前 grade なし) は Planned と同色
 *  - Future 未来側: 配分済は Planned
 *
 * 例外 (overflow / over-budget) は塗りではなく **枠線** で示す:
 *  - Overflow (milestone 締切超過 pile-up) → 赤 dashed border
 *  - Over budget (1問が daily 枠超過)      → amber solid border
 */

// 「prior grade なし」群 — Planned (未来) と First (過去) は同一 phase の時間両端。
// 同色にすると past alpha 経由で First は自動的に「沈んだ Planned」として読める。
// purple 系: 評価グラデ (red→orange→yellow→green→blue) の hue 外。grade と混同されない。
// purple は warm grade より perceived luminance が低いので past 側だけ一段明るい base を採用
// (past alpha 適用後も読めるように)。未来は full alpha なので眩しさを避けて purple-400。
export const COLOR_PLANNED = "#c084fc";        // purple-400 — 未来側、actionable
export const COLOR_FIRST_ATTEMPT = "#d8b4fe99";  // purple-300 @ 60% — past 側用、grade の PAST_ALPHA (30%) より明るく

// past actuals は「実体」として背景に沈める。塗りに被せる alpha (00-ff hex)
export const PAST_ALPHA = "4d"; // ~30% — soft smoke

// メタ群 (border only — 塗らない)
const BORDER_OVERFLOW = "#ef4444";   // red
const BORDER_OVER_BUDGET = "#f59e0b"; // amber

export type BlockKind =
  | { side: "past"; prevStatusColor: string | null }
  | { side: "future"; overflow: boolean; overBudget: boolean };

export function blockColor(kind: BlockKind): string {
  if (kind.side === "past") {
    const base = kind.prevStatusColor ?? COLOR_FIRST_ATTEMPT;
    // 7-char (#rrggbb) のみ alpha 付与。既に 8-char ならそのまま
    return base.length === 7 ? `${base}${PAST_ALPHA}` : base;
  }
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
