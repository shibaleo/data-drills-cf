/**
 * Tetris 系チャート (Review / Backlog / Throughput) の軸ラベル用フォーマッタ。
 *
 * 規約:
 *  - 0  → "today"
 *  - 正 → "+N d"
 *  - 負 → "▲ N d"  (overdue / 過去側を視覚的に強調するため記号 ▲ を使う)
 */
export function formatRelDay(diff: number): string {
  if (diff === 0) return "Today";
  if (diff > 0) return `+${diff} d`;
  return `▲ ${Math.abs(diff)} d`;
}
