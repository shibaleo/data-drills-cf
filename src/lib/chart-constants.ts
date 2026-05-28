/**
 * Tetris チャート (Review / Backlog / Throughput) 共通の幾何定数。
 * セルサイズ・縦軸ゲージなど 3 ビューで揃えたいものだけここに置く。
 *
 * 軸高さ (TOP_AXIS_H / BOTTOM_AXIS_H) と日数パディング (PAD_DAYS) は
 * 各チャートのレイアウト要件 (milestone area の有無など) で差があるため
 * 共通化せず、ページ側にローカル定義する。
 */

export const CELL = 14;
export const GAP = 2;
export const STEP = CELL + GAP;

/** Y 軸 (=スタック数ゲージ) の幅 px。 */
export const Y_AXIS_W = 28;

/** 縦行数の最低値。データが少なくてもこの高さを確保する。 */
export const MIN_ROWS = 10;
