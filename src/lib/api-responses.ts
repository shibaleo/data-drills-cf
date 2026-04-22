/**
 * Centralized response types for app-specific API endpoints.
 *
 * These shapes mirror what the corresponding Hono routes return.
 * Co-locating them here lets pages and shared components import the
 * same types instead of re-declaring them.
 *
 * Status names are plain strings — no literal type dependency.
 */

/** Row returned by GET /answers-list */
export interface AnswerListRow {
  id: string
  problemId: string
  date: string
  duration: string | null
  status: string | null
  statusColor: string | null
  code: string
  problemName: string
  subjectId: string | null
  subjectName: string
  levelId: string | null
  levelName: string
}

/** Row returned by GET /schedule */
export interface ScheduleRow {
  problemId: string
  code: string
  name: string
  subjectId: string | null
  subjectName: string
  subjectColor: string | null
  levelId: string | null
  levelName: string
  levelColor: string | null
  lastStatus: string
  statusColor: string
  nextReview: string
  daysUntil: number
  answerCount: number
  standardTime: number | null
  answerHistory: { date: string; color: string; status: string }[]
  color: string
}
