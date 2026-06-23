import type { StatusItem } from '@/hooks/use-field'

/**
 * Determine the suggested next status based on the most recent answer.
 * sortOrder 契約:
 *   - sorted[0]      = no-grade slot (= "New" 等。回答していない placeholder)
 *   - sorted[1..n-1] = graded (low → high)
 * 回答記録時のデフォルトは sorted[1] (= 最も低い grade、現状 Miss) にする。
 */
export function nextStatus(
  answers: { date: string | null; status: string | null; created_at?: string }[],
  statuses: StatusItem[],
): string {
  const sorted = statuses.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  if (sorted.length === 0) return ''
  const graded = sorted.slice(1)
  const firstGraded = graded[0] ?? sorted[0]

  const latest = [...answers]
    .filter((a) => a.date)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const last = latest[0]?.status
  if (!last) return firstGraded.name

  const idx = sorted.findIndex((s) => s.name === last)
  return idx >= 0 && idx < sorted.length - 1
    ? sorted[idx + 1].name
    : sorted[sorted.length - 1].name
}
