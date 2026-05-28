/**
 * 標準時間 (秒) → 実効時間 (秒) の変換。
 *
 * 現状: 単純な比例 (std × timeMultiplierPct / 100)。
 * 今後: 一次関数 (a*std + b) や非線形 (ceiling, plateau) に拡張予定。
 *
 * 変換ロジックは allocate engine とは独立して差し替えたいため別モジュール化。
 * 引数を増やす際は MemberInput を渡せるようシグネチャ拡張する。
 */

const DEFAULT_SEC = 10 * 60;  // standard_time 未設定問題のフォールバック (10 分)

export type EffectiveTimeConfig = {
  timeMultiplierPct: number;
};

export function effectiveTimeSec(
  standardTimeSec: number | null,
  config: EffectiveTimeConfig,
): number {
  const base = standardTimeSec ?? DEFAULT_SEC;
  const mult = Math.max(1, config.timeMultiplierPct) / 100;
  return Math.round(base * mult);
}
