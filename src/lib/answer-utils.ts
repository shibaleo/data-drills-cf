import type { StatusItem } from '@/hooks/use-project'

/**
 * Determine the suggested next status based on the most recent answer.
 * Uses the sortOrder-sorted statuses array from DB — no hardcoded names.
 */
export function nextStatus(
  answers: { date: string | null; status: string | null; created_at?: string }[],
  statuses: StatusItem[],
): string {
  const sorted = statuses.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  if (sorted.length === 0) return ''

  const latest = [...answers]
    .filter((a) => a.date)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const last = latest[0]?.status
  if (!last) return sorted[0].name

  const idx = sorted.findIndex((s) => s.name === last)
  return idx >= 0 && idx < sorted.length - 1
    ? sorted[idx + 1].name
    : sorted[sorted.length - 1].name
}
