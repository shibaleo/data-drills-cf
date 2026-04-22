/**
 * FSRS-based scoring utilities.
 *
 * Retention (power-law):
 *   R(t, S) = (1 + F * t / S) ^ C
 *   F = 19/81, C = -0.5
 *
 * Score:
 *   Score = P_i × C_T
 *   P_i = (I_i / I_max)^γ × 100   (Stevens' Power Law)
 *   C_T = c × t_std / t_dur
 *
 * All status-specific constants (stability, color, etc.) are loaded from the
 * DB via `answer_status` — no hardcoded status names in this file.
 */

/* ── Constants ── */

const F = 19 / 81
const C = -0.5

/** Stevens' Power Law exponent for evaluation points */
const GAMMA = 0.5

/** Target ratio of standard time to answer time */
const TIME_COEFF_C = 0.5

/* ── Core functions ── */

/**
 * Compute evaluation point P_i from stability days.
 * P_i = (I_i / I_max)^γ × 100
 */
export function computeEvalPoint(stabilityDays: number, maxStability: number): number {
  if (maxStability <= 0 || stabilityDays <= 0) return 0
  return Math.pow(stabilityDays / maxStability, GAMMA) * 100
}

/**
 * FSRS power-law retention.
 * Returns 0–1.
 */
export function fsrsRetention(elapsedDays: number, stability: number): number {
  if (stability <= 0 || elapsedDays < 0) return 0
  return Math.pow(1 + F * elapsedDays / stability, C)
}

/**
 * Compute problem score.
 * Score = P_i × C_T
 * P_i = (I_i / I_max)^γ × 100
 * C_T = c × t_std / t_dur  (defaults to 1 if time data missing)
 */
export function computeScore(
  stabilityDays: number,
  maxStability: number,
  standardTimeSec: number | null,
  durationSec: number | null,
): number {
  const Pi = computeEvalPoint(stabilityDays, maxStability)
  if (Pi === 0) return 0
  const Ct =
    standardTimeSec && durationSec && durationSec > 0
      ? TIME_COEFF_C * standardTimeSec / durationSec
      : 1
  return Pi * Ct
}

/**
 * Compute next review date from last answer date and stability days.
 * When standardTimeSec and durationSec are provided, stability is adjusted:
 *   adjustedStability = base × C_T,  C_T = c × t_std / t_dur
 * Reference point: t_dur = t_std/2 → C_T = 1 (unchanged from base).
 */
export function computeNextReview(
  lastDateStr: string,
  stabilityDays: number,
  standardTimeSec?: number | null,
  durationSec?: number | null,
): string {
  let s = stabilityDays
  if (s <= 0) {
    // Immediate review needed (next = last answer date)
    return lastDateStr.slice(0, 10)
  }
  if (standardTimeSec && durationSec && durationSec > 0) {
    s = s * TIME_COEFF_C * standardTimeSec / durationSec
  }
  const d = new Date(lastDateStr)
  d.setDate(d.getDate() + Math.round(s))
  return d.toISOString().slice(0, 10)
}

/**
 * Compute days overdue (positive = overdue, negative = days remaining).
 */
export function computeDaysOverdue(
  nextReview: string,
  todayStr: string,
): number {
  const next = new Date(nextReview).getTime()
  const today = new Date(todayStr).getTime()
  return Math.round((today - next) / 86_400_000)
}

/* ── Score history for graph ── */

export interface ScorePoint {
  date: string
  daysSinceFirst: number
  score: number
  statusName: string
}

/**
 * Build score history from a problem's answers.
 * Each answer produces a score data point.
 */
export function computeScoreHistory(
  answers: {
    date: string
    statusName: string | null
    stabilityDays: number
    durationSec: number | null
    created_at?: string
  }[],
  standardTimeSec: number | null,
  maxStability: number,
): ScorePoint[] {
  const dated = answers
    .filter((a): a is { date: string; statusName: string; stabilityDays: number; durationSec: number | null; created_at?: string } =>
      a.date !== null && a.statusName !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  if (dated.length === 0) return []

  const firstDate = new Date(dated[0].date).getTime()

  return dated.map((a) => {
    const score = computeScore(a.stabilityDays, maxStability, standardTimeSec, a.durationSec)
    const daysSinceFirst = Math.round(
      (new Date(a.date).getTime() - firstDate) / 86_400_000,
    )
    return { date: a.date, daysSinceFirst, score, statusName: a.statusName }
  })
}

/**
 * Fit prediction line using linear regression on log(score) vs days.
 * Returns { slope, intercept, predictedDay100 } or null if not enough data.
 * predictedDay100 = day when score reaches 100 (from first answer).
 */
export function fitPredictionLine(
  history: ScorePoint[],
): { slope: number; intercept: number; predictedDay100: number | null } | null {
  // Only use points with score > 0
  const pts = history.filter((p) => p.score > 0)
  if (pts.length < 2) return null

  const xs = pts.map((p) => p.daysSinceFirst)
  const ys = pts.map((p) => Math.log(p.score))

  const n = xs.length
  const sumX = xs.reduce((s, v) => s + v, 0)
  const sumY = ys.reduce((s, v) => s + v, 0)
  const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0)
  const sumX2 = xs.reduce((s, v) => s + v * v, 0)

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-10) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  // Predict day when log(score) = log(100)
  const log100 = Math.log(100)
  let predictedDay100: number | null = null
  if (slope > 0) {
    predictedDay100 = Math.round((log100 - intercept) / slope)
  }

  return { slope, intercept, predictedDay100 }
}
