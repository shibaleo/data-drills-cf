/**
 * JST (UTC+9) date utilities.
 *
 * The app stores dates as ISO strings (UTC) but all display and calendar-day
 * comparisons should use JST because users are in Japan.
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** Convert a Date to "YYYY-MM-DD" in JST */
export function toJSTDateString(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Get today's date string in JST: "YYYY-MM-DD" */
export function todayJST(): string {
  return toJSTDateString(new Date())
}

/** Get current ISO timestamp shifted to JST date with real time */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Extract "YYYY-MM-DD" in JST from a stored date string.
 * Handles both full ISO timestamps and date-only strings.
 */
export function toJSTDate(dateStr: string): string {
  return toJSTDateString(new Date(dateStr))
}

/**
 * Calendar-day difference in JST between two date strings.
 * Returns (a - b) in whole days.
 */
export function jstDayDiff(a: string, b: string): number {
  const da = toJSTDate(a)
  const db = toJSTDate(b)
  return Math.round(
    (new Date(da).getTime() - new Date(db).getTime()) / 86_400_000,
  )
}

/** Format a date string as "M/D" in JST for chart axes. */
export function formatMonthDay(dateStr: string): string {
  const d = new Date(new Date(dateStr).getTime() + JST_OFFSET_MS)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
