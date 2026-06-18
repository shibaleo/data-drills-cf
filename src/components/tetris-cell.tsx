/**
 * テトリスブロック風の cell スタイルを project 全体で統一するための共有定数。
 * HTML 用 (Tailwind class) と SVG 用 (rect 属性) の両方を提供。
 */
export const tetrisCellClass = "aspect-square rounded-[2px]";
export const tetrisEmptyClass = `${tetrisCellClass} border border-border/60`;

export const TETRIS_RX = 2;
export const TETRIS_STROKE = "hsl(var(--border))";
export const TETRIS_STROKE_OPACITY = 0.6;
export const TETRIS_STROKE_WIDTH = 0.5;
