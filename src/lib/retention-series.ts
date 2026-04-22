import { computeStability, retention } from './forgetting-curve'
import { toJSTDateString } from './date-utils'

export interface RetentionPoint {
  /** "YYYY-MM-DD" */
  date: string
  /** 0–100 */
  retention: number
}

export interface ProblemRetentionSeries {
  problemId: string
  code: string
  name: string
  subjectId: string
  series: RetentionPoint[]
}

interface DatedAnswer {
  date: string
  status: string | null
  point?: number
  created_at?: string
}

/**
 * Pre-compute stability array and sorted answers for a problem.
 * This is cheap and can be done eagerly.
 */
export interface ProblemRetentionMeta {
  problemId: string
  code: string
  name: string
  subjectId: string
  levelId: string
  dated: DatedAnswer[]
  stabilities: number[]
  /** Current retention 0–100 (for card summary) */
  currentRetention: number
}

export function buildRetentionMeta(
  problemId: string,
  code: string,
  name: string,
  subjectId: string,
  levelId: string,
  answers: { date: string | null; status: string | null; point?: number; created_at?: string }[],
  now: Date,
): ProblemRetentionMeta | null {
  const dated = answers
    .filter((a): a is DatedAnswer => a.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  if (dated.length === 0) return null

  const qualities = dated.map((a) => a.point ?? 1)
  const stabilities: number[] = []
  for (let i = 0; i < qualities.length; i++) {
    stabilities.push(computeStability(qualities.slice(0, i + 1)))
  }

  const lastDate = new Date(dated[dated.length - 1].date)
  const todayStr = toJSTDateString(now)
  const today = new Date(todayStr)
  const elapsed = Math.max(0, (today.getTime() - lastDate.getTime()) / 86_400_000)
  const currentRetention = Math.round(retention(elapsed, stabilities[stabilities.length - 1]) * 100)

  return { problemId, code, name, subjectId, levelId, dated, stabilities, currentRetention }
}

/**
 * Build a sampled retention time-series from pre-computed meta.
 * Samples every `step` days to keep data points manageable.
 */
export function buildRetentionSeries(
  meta: ProblemRetentionMeta,
  now: Date,
  maxPoints = 120,
): RetentionPoint[] {
  const { dated, stabilities } = meta
  if (dated.length === 0) return []

  const firstDate = new Date(dated[0].date)
  const todayStr = toJSTDateString(now)
  const endDate = new Date(todayStr)
  const totalDays = Math.max(1, Math.round((endDate.getTime() - firstDate.getTime()) / 86_400_000))
  const step = Math.max(1, Math.ceil(totalDays / maxPoints))

  const series: RetentionPoint[] = []
  const current = new Date(firstDate)
  let answerIdx = 0

  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10)

    // Advance answerIdx (binary-search-like forward scan)
    while (answerIdx < dated.length - 1 && dated[answerIdx + 1].date <= dateStr) {
      answerIdx++
    }

    if (dated[answerIdx].date <= dateStr) {
      const lastAnswerDate = new Date(dated[answerIdx].date)
      const elapsed = Math.max(0, (current.getTime() - lastAnswerDate.getTime()) / 86_400_000)
      const ret = retention(elapsed, stabilities[answerIdx])
      series.push({ date: dateStr, retention: Math.round(ret * 100) })
    }

    current.setDate(current.getDate() + step)
  }

  // Always include today as the last point
  const lastStr = todayStr
  if (series.length === 0 || series[series.length - 1].date !== lastStr) {
    const lastAnswerDate = new Date(dated[dated.length - 1].date)
    const elapsed = Math.max(0, (endDate.getTime() - lastAnswerDate.getTime()) / 86_400_000)
    const ret = retention(elapsed, stabilities[stabilities.length - 1])
    series.push({ date: lastStr, retention: Math.round(ret * 100) })
  }

  return series
}

/**
 * Compute sampled average retention across metas.
 * Only iterates the date range once (no per-problem series needed).
 */
export function buildAverageRetentionSeries(
  metas: ProblemRetentionMeta[],
  now: Date,
  maxPoints = 120,
): RetentionPoint[] {
  if (metas.length === 0) return []

  // Find the earliest first-answer date
  let earliest = Infinity
  for (const m of metas) {
    const t = new Date(m.dated[0].date).getTime()
    if (t < earliest) earliest = t
  }

  const todayStr = toJSTDateString(now)
  const endDate = new Date(todayStr)
  const totalDays = Math.max(1, Math.round((endDate.getTime() - earliest) / 86_400_000))
  const step = Math.max(1, Math.ceil(totalDays / maxPoints))

  // Pre-build answer index cursors for each meta
  const cursors = metas.map(() => 0)

  const series: RetentionPoint[] = []
  const current = new Date(earliest)

  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10)
    let sum = 0
    let count = 0

    for (let mi = 0; mi < metas.length; mi++) {
      const m = metas[mi]
      // Advance cursor
      while (cursors[mi] < m.dated.length - 1 && m.dated[cursors[mi] + 1].date <= dateStr) {
        cursors[mi]++
      }
      const idx = cursors[mi]
      if (m.dated[idx].date <= dateStr) {
        const lastAnswerDate = new Date(m.dated[idx].date)
        const elapsed = Math.max(0, (current.getTime() - lastAnswerDate.getTime()) / 86_400_000)
        const ret = retention(elapsed, m.stabilities[idx])
        sum += ret
        count++
      }
    }

    if (count > 0) {
      series.push({ date: dateStr, retention: Math.round((sum / count) * 100) })
    }

    current.setDate(current.getDate() + step)
  }

  return series
}
