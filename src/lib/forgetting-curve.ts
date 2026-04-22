import { jstDayDiff, toJSTDateString } from './date-utils'

/**
 * Forgetting-curve utilities based on exponential decay model.
 *
 * retention(t) = e^(-t / S)
 *
 * where:
 *   t = elapsed days since last review
 *   S = stability (grows with successful reviews)
 *
 * Quality is derived from `sortOrder + 1` (1-based).
 * No hardcoded status names — all status data comes from DB.
 */

const BASE_STABILITY = 1 // days – initial stability for a fresh card

/**
 * Compute stability S from a list of answer qualities (chronological order).
 * Each successful review (quality >= 3) multiplies stability by a factor
 * proportional to quality. Failed reviews (quality < 3) partially reset it.
 */
export function computeStability(qualities: number[]): number {
  let S = BASE_STABILITY
  for (const q of qualities) {
    if (q >= 3) {
      // Good recall ��� stability grows
      S *= 1 + (q - 2) * 0.4 // q=3→1.4x, q=4→1.8x, q=5→2.2x
    } else if (q <= 1) {
      // No recall → stability shrinks but doesn't fully reset
      S = Math.max(BASE_STABILITY, S * 0.5)
    }
    // q=2 → stability unchanged
  }
  return S
}

/**
 * Compute retention (0-1) given elapsed days and stability.
 */
export function retention(elapsedDays: number, stability: number): number {
  return Math.exp(-elapsedDays / stability)
}

/**
 * Convert sortOrder (0-based) to quality (1-based).
 * Answers without a status default to quality 1 (worst).
 */
export function sortOrderToQuality(sortOrder: number | undefined): number {
  return sortOrder !== undefined ? sortOrder + 1 : 1
}

export interface ForgettingInfo {
  /** 0-1 estimated memory retention */
  retention: number
  /** stability in days */
  stability: number
  /** days since last review */
  elapsedDays: number
  /** total number of reviews */
  reviewCount: number
  /** average duration in seconds (null if no duration data) */
  avgDurationSec: number | null
}

/** Parse "HH:MM:SS" or "MM:SS" to seconds */
export function parseDurationSec(d: string | null): number | null {
  if (!d) return null
  const parts = d.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/**
 * Compute forgetting info for a problem given its answers (any order).
 * Returns null if the problem has no answers with dates.
 * `sortOrder` on each answer is used to derive quality (sortOrder + 1).
 * Falls back to `point` if provided, then sortOrder.
 */
export function computeForgettingInfo(
  answers: { date: string | null; sortOrder?: number; point?: number; duration?: string | null; created_at?: string }[],
  now: Date = new Date(),
): ForgettingInfo | null {
  // Sort chronologically
  const dated = answers
    .filter((a): a is typeof a & { date: string } => a.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  if (dated.length === 0) return null

  const qualities = dated.map((a) => a.point ?? sortOrderToQuality(a.sortOrder))
  const stability = computeStability(qualities)
  const elapsedDays = Math.max(0, jstDayDiff(toJSTDateString(now), dated[dated.length - 1].date))
  const ret = retention(elapsedDays, stability)

  // Average duration (exclude 0s entries — likely missing data)
  const durations = answers
    .map((a) => parseDurationSec(a.duration ?? null))
    .filter((v): v is number => v !== null && v > 0)
  const avgDurationSec = durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : null

  return { retention: ret, stability, elapsedDays, reviewCount: dated.length, avgDurationSec }
}

/**
 * Interleave urgency-sorted problems so heavy and light items alternate.
 */
export function interleaveByDuration<T extends { avgDurationSec: number | null }>(
  items: T[],
  defaultSec: number = 10 * 60,
): T[] {
  if (items.length <= 2) return items

  const durations = items.map((it) => it.avgDurationSec ?? defaultSec)
  const sorted = [...durations].sort((a, b) => a - b)
  const p75 = sorted[Math.floor(sorted.length * 0.75)]

  const heavy: T[] = []
  const light: T[] = []
  for (let i = 0; i < items.length; i++) {
    if (durations[i] > p75) heavy.push(items[i])
    else light.push(items[i])
  }

  const result: T[] = []
  const gap = heavy.length > 0 ? Math.max(1, Math.floor(light.length / heavy.length)) : 0
  let hi = 0
  let li = 0
  while (hi < heavy.length || li < light.length) {
    if (hi < heavy.length) result.push(heavy[hi++])
    for (let g = 0; g < gap && li < light.length; g++) {
      result.push(light[li++])
    }
  }
  while (li < light.length) result.push(light[li++])
  return result
}
