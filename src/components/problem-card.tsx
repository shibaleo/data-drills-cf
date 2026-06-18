'use client'

import { useEffect, useState, useRef, type RefObject } from 'react'
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProblemWithAnswers, AnswerWithReviews } from '@/hooks/queries/use-problems'
import type { Problem } from '@/lib/types'
export type { ProblemWithAnswers, AnswerWithReviews }
import { parseDuration, fmtDiff, secondsToHms } from '@/lib/duration'
import { toJSTDate, jstDayDiff, todayJST } from '@/lib/date-utils'
import { computeForgettingInfo } from '@/lib/forgetting-curve'
import { computeNextReview } from '@/lib/srs-scoring'
import { useLookup } from '@/hooks/use-field'
import { useSubjects, useLevels, useFields } from '@/hooks/queries/use-field-data'
import { Markdown } from '@/components/markdown'
import { MarkdownEditor } from '@/components/markdown-editor'
import { DurationSparkline } from '@/components/duration-sparkline'
import { ProblemPdfLink } from '@/components/problem-pdf-link'
import { StatusTag } from '@/components/color-tags'
import { Card, CardContent } from '@/components/ui/card'
import { rpc, unwrap } from '@/lib/rpc-client'


const TAG_BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs'

export function OpaqueTag({ name, color }: { name: string; color: string | null }) {
  if (!color) {
    return <span className={`${TAG_BASE} bg-muted text-muted-foreground`}>{name}</span>
  }
  return (
    <span
      className={TAG_BASE}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, hsl(var(--card)) 80%, ${color})`,
      }}
    >
      {name}
    </span>
  )
}

/* ── Card list with infinite scroll ── */

interface ProblemCardListProps {
  problems: ProblemWithAnswers[]
  now: Date
  onCheck: ProblemCardProps['onCheck']
  onEditProblem: ProblemCardProps['onEditProblem']
  onEditAnswer: ProblemCardProps['onEditAnswer']
  onDelete: ProblemCardProps['onDelete']
  onPdfLinked: ProblemCardProps['onPdfLinked']
  sentinelRef: RefObject<HTMLDivElement | null>
  loadingMore: boolean
  emptyMessage?: string
}

export function ProblemCardList({
  problems,
  now,
  onCheck,
  onEditProblem,
  onEditAnswer,
  onDelete,
  onPdfLinked,
  sentinelRef,
  loadingMore,
  emptyMessage = 'データがありません',
}: ProblemCardListProps) {
  return (
    <>
      <div className="space-y-4">
        {problems.map((p) => (
          <ProblemCard
            key={p.id}
            problem={p}
            now={now}
            onCheck={onCheck}
            onEditProblem={onEditProblem}
            onEditAnswer={onEditAnswer}
            onDelete={onDelete}
            onPdfLinked={onPdfLinked}
          />
        ))}
        {problems.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>
        )}
      </div>
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <p className="text-center text-muted-foreground text-sm py-2">読み込み中...</p>
      )}
    </>
  )
}

/* ── Single card ── */

interface ProblemCardProps {
  problem: ProblemWithAnswers
  now: Date
  /** Called when the check button is clicked to log a new answer */
  onCheck: (problem: ProblemWithAnswers) => void
  /** Called when the edit (pencil) button on the problem header is clicked */
  onEditProblem: (problem: Problem) => void
  /** Called when the edit (pencil) button on an answer timeline entry is clicked */
  onEditAnswer: (answer: AnswerWithReviews, problem: ProblemWithAnswers) => void
  /** Called when the delete button is clicked. If omitted, the delete button is hidden. */
  onDelete?: (id: string) => void
  /** Called after a PDF is linked via Drive Picker. If omitted, PDF section is hidden. */
  onPdfLinked?: (problemId: string) => void
  /** Render without Card wrapper (for use inside dialogs) */
  bare?: boolean
  /** answers のうち a.date === dateFilter のものだけ表示する (digest day view 用)。 */
  dateFilter?: string
  /** Retention bar / sparkline / next review メタ行を隠す。 */
  hideHeader?: boolean
  /** checkpoint markdown を隠す。 */
  hideCheckpoint?: boolean
  /** action row (PDF link / delete / +check) を隠す。 */
  hideActions?: boolean
  /** review.content を click → MarkdownEditor で in-place 編集できるようにする。 */
  editableReviews?: boolean
  /** editableReviews 経由で保存が成功した時の callback。invalidate に使う。 */
  onReviewSaved?: () => void
}

export function ProblemCard({
  problem: p,
  now,
  onCheck,
  onEditProblem,
  onEditAnswer,
  onDelete,
  onPdfLinked,
  bare,
  dateFilter,
  hideHeader,
  hideCheckpoint,
  hideActions,
  editableReviews,
  onReviewSaved,
}: ProblemCardProps) {
  // problem-card は色付け用に lookup を使う。card は ProblemWithAnswers を
  // 受け取るので、p.field_id を起点に subjects/levels を引く (page-local picker
  // の影響を受けない形)。
  const { data: subjects = [] } = useSubjects(p.field_id)
  const { data: levels = [] } = useLevels(p.field_id)
  const { data: fields = [] } = useFields()
  const field = fields.find((f) => f.id === p.field_id) ?? null
  const lookup = useLookup(subjects, levels)
  const answersAll = [...p.answers].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )
  const answers = dateFilter
    ? answersAll.filter((a) => a.date === dateFilter)
    : answersAll
  const info = computeForgettingInfo(p.answers, now)
  const [highlightDate, setHighlightDate] = useState<string | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const toggleHighlight = (date: string | null) => {
    setHighlightDate((prev) => (prev === date ? null : date))
  }

  const nextReviewInfo = (() => {
    if (answers.length === 0 || !answers[0].date || !answers[0].status) return null
    const latest = answers[0]
    const durSec = parseDuration(latest.duration)
    const nextReview = computeNextReview(latest.date!, lookup.statusStability(latest.status!), p.standard_time, durSec)
    const today = todayJST()
    const diff = Math.round(
      (new Date(nextReview).getTime() - new Date(today).getTime()) / 86_400_000,
    )
    return { date: nextReview, diff }
  })()

  const content = (
    <div className="relative space-y-3">
        {/* Header: code + edit (left) | subject, level (right) */}
        <div className="flex items-center gap-1.5 text-xs">
          {field && <OpaqueTag name={field.name} color={field.color || null} />}
          <OpaqueTag name={lookup.subjectName(p.subject_id)} color={lookup.subjectColor(p.subject_id) || null} />
          <OpaqueTag name={lookup.levelName(p.level_id)} color={lookup.levelColor(p.level_id) || null} />
          <span className="font-mono font-medium text-sm whitespace-nowrap">{p.code}</span>
          <button
            type="button"
            onClick={() => onEditProblem(p)}
            title="問題を編集"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors print:hidden"
          >
            <Pencil className="size-3" />
          </button>
          {p.standard_time != null && (
            <span className="ml-auto text-[10px] font-mono tabular-nums text-primary">{secondsToHms(p.standard_time)}</span>
          )}
        </div>

        {p.name && (
          <div className="-mt-2">
            <span className="text-sm font-medium text-foreground">{p.name}</span>
          </div>
        )}

        {/* Retention bar + schedule info + Sparkline */}
        {hideHeader ? null : info ? (
          <div className="-mt-1 flex items-center gap-2 overflow-visible">
            <div className="h-1.5 w-16 shrink-0 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round(info.retention * 100)}%`,
                  backgroundColor: `hsl(${info.retention * 120}, 80%, 50%)`,
                }}
              />
            </div>
            <span className="text-[10px] font-medium text-foreground/60 whitespace-nowrap">
              {Math.round(info.retention * 100)}%
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-foreground/50 whitespace-nowrap">
                最終解答 {info.elapsedDays < 1 ? '今日' : `${Math.round(info.elapsedDays)}日前`}
              </span>
              {nextReviewInfo && (
                <span className="text-[10px] text-foreground/50 whitespace-nowrap">
                  次回 {nextReviewInfo.date}
                  <span className={nextReviewInfo.diff <= 0 ? ' text-destructive font-medium' : ''}>
                    {nextReviewInfo.diff === 0 ? '（今日）' : nextReviewInfo.diff > 0 ? `（${nextReviewInfo.diff}日後）` : `（${Math.abs(nextReviewInfo.diff)}日超過）`}
                  </span>
                </span>
              )}
              <div className="leading-[0]">
                <DurationSparkline
                  entries={answers.slice().reverse().map((a) => ({
                    date: a.date ?? '',
                    duration: a.duration,
                    color: a.status ? lookup.statusColor(a.status) : null,
                  }))}
                  highlightDate={highlightDate}
                  onClickDot={(date) => toggleHighlight(date)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center overflow-visible">
            <span className="text-[10px] text-muted-foreground">未回答</span>
          </div>
        )}

        {/* Checkpoint */}
        {!hideCheckpoint && p.checkpoint && (
          <div className="text-xs text-foreground">
            <Markdown>{p.checkpoint}</Markdown>
          </div>
        )}

        {/* Answers — timeline style */}
        {answers.length > 0 && (
          <div ref={timelineRef} className="relative ml-5">
            {/* Continuous vertical timeline line */}
            <div className="absolute left-[-1px] -translate-x-1/2 top-3 bottom-[18px] w-0.5 bg-border" />
            {answers.map((a, i) => {
              const reviews = [...a.reviews].sort(
                (x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? ''),
              )
              let dayGap: number | null = null
              if (i > 0 && a.date && answers[i - 1].date) {
                dayGap = jstDayDiff(answers[i - 1].date!, a.date)
              }
              const isAnswerHighlighted = a.date === highlightDate
              return (
                <div key={a.id} data-answer-date={a.date ?? undefined}>
                  {dayGap !== null && dayGap > 0 && (
                    <div className="relative h-5">
                      <span className="absolute left-[-1px] -translate-x-1/2 top-1/2 -translate-y-1/2 bg-card px-1.5 text-[10px] text-foreground/60 whitespace-nowrap">
                        {dayGap}日
                      </span>
                    </div>
                  )}
                  <div
                    className={`relative pl-9 py-1.5 space-y-2 rounded transition-colors ${isAnswerHighlighted ? 'bg-accent/50' : ''}`}
                  >
                    <div
                      className="absolute left-[-1px] -translate-x-1/2 top-[12px] -translate-y-1/2 whitespace-nowrap cursor-pointer"
                      onClick={() => {
                        if (!a.date) return
                        toggleHighlight(a.date)
                      }}
                    >
                      {a.status ? <StatusTag status={a.status} color={lookup.statusColor(a.status)} opaque /> : <span className="inline-block size-2 rounded-full bg-foreground/40" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-foreground/60">{a.date ? toJSTDate(a.date) : '-'}</span>
                      <span className="ml-auto text-foreground/60">{a.duration ?? ''}</span>
                      {(() => {
                        if (!p.standard_time) return null
                        const sec = parseDuration(a.duration)
                        if (sec === null) return null
                        const pct = Math.round((sec / p.standard_time) * 100)
                        return (
                          <span className={`text-[10px] tabular-nums ${pct <= 100 ? 'text-green-400' : 'text-red-400'}`}>
                            {pct}%
                          </span>
                        )
                      })()}
                      {(() => {
                        const prev = answers[i + 1]
                        const cur = parseDuration(a.duration)
                        const pre = parseDuration(prev?.duration)
                        if (cur === null || pre === null || cur - pre === 0) {
                          return <span className="w-12" />
                        }
                        const diff = cur - pre
                        const faster = diff < 0
                        return (
                          <span className={`inline-flex w-12 items-center justify-end gap-0.5 ${faster ? 'text-green-400' : 'text-red-400'}`}>
                            {faster ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                            <span className="text-[10px] tabular-nums">{fmtDiff(diff)}</span>
                          </span>
                        )
                      })()}
                      <button
                        type="button"
                        onClick={() => onEditAnswer(a, p)}
                        title="編集"
                        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors print:hidden"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </div>
                    {reviews.map((rv) => (
                      <ReviewBlock key={rv.id}
                        review={rv}
                        editable={editableReviews}
                        onSaved={onReviewSaved}/>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Action row: dustbox, link | pdf, show, + */}
        {hideActions ? null : onPdfLinked ? (
          <ProblemPdfLink
            problemFiles={p.problem_files}
            problemId={p.id}
            onLinked={onPdfLinked}
            startActions={
              onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  title="削除"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )
            }
            endActions={
              <button
                type="button"
                onClick={() => onCheck(p)}
                title="解答を登録"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <Plus className="size-3.5" />
              </button>
            }
          />
        ) : (
          <div className="flex items-center">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                title="削除"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onCheck(p)}
              title="解答を登録"
              className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
    </div>
  )

  if (bare) return content

  return (
    <Card className="py-4">
      <CardContent>
        {content}
      </CardContent>
    </Card>
  )
}

/**
 * Review 1 件分の表示 + (optional) in-place 編集。
 * editable=true の時に content 部分を click → MarkdownEditor で書き換え、
 * Save で `PUT /reviews/:id` を投げて表示モードに戻す。
 */
function ReviewBlock({
  review, editable, onSaved,
}: {
  review: AnswerWithReviews['reviews'][number]
  editable?: boolean
  onSaved?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(review.content ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(review.content ?? '') }, [review.content])

  const save = async () => {
    if (saving) return
    const next = draft.trim()
    if (next === (review.content ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      await unwrap(rpc.api.v1.reviews[':id'].$put({
        param: { id: review.id },
        json: { content: next },
      }))
      onSaved?.()
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-1 text-xs">
      {review.review_type && (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs -ml-6 bg-muted text-muted-foreground">{review.review_type}</span>
      )}
      {editing ? (
        <div className="mt-1 space-y-1.5 print:hidden">
          <MarkdownEditor
            defaultValue={review.content ?? ''}
            onChange={setDraft}
            compact
            className="text-sm"
          />
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={save} disabled={saving}
              className="text-[10px] text-primary hover:underline disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button"
              onClick={() => { setDraft(review.content ?? ''); setEditing(false) }}
              className="text-[10px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : editable ? (
        <button type="button"
          onClick={() => setEditing(true)}
          title="クリックで編集"
          className="block w-full text-left text-sm text-foreground mt-1 leading-relaxed rounded hover:bg-accent/30 px-1 -mx-1 cursor-text print:hover:bg-transparent">
          {review.content
            ? <Markdown>{review.content}</Markdown>
            : <span className="text-muted-foreground italic">(空 — クリックで追記)</span>}
        </button>
      ) : (
        review.content && (
          <div className="text-sm text-foreground mt-1 leading-relaxed">
            <Markdown>{review.content}</Markdown>
          </div>
        )
      )}
    </div>
  )
}
