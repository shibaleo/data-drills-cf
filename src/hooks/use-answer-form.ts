'use client'

import { useState, useMemo } from 'react'
import { useForm, useFieldArray, type UseFormReturn, type UseFieldArrayReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { rpc, unwrap } from '@/lib/rpc-client'
import { nextStatus } from '@/lib/answer-utils'
import { useProject } from '@/hooks/use-project'
import { answerFormSchema, type AnswerFormData } from '@/lib/schemas/answer-form'
import type { ReviewType, Problem, AnswerWithReviews } from '@/lib/types'

/** Convert "HH:MM:SS" → seconds */
function durationToSeconds(dur: string): number | null {
  const m = dur.match(/^(\d+):(\d+):(\d+)$/)
  if (!m) return null
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

/**
 * Resolve a problem by (project, subject, level, code).
 * Returns the existing problem ID, or creates a new one.
 */
async function resolveProblemId(
  projectId: string,
  subjectId: string,
  levelId: string,
  code: string,
): Promise<string | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const listRes = await unwrap(rpc.api.v1.problems.$get({ query: { project_id: projectId } }))
  const existing = listRes.data.find(
    (p) => p.subjectId === subjectId && p.levelId === levelId && p.code === trimmed,
  )
  if (existing) return existing.id

  try {
    const res = await unwrap(
      rpc.api.v1.problems.$post({
        json: {
          project_id: projectId,
          subject_id: subjectId,
          level_id: levelId,
          code: trimmed,
          name: '',
        },
      }),
    )
    return res.data.id
  } catch {
    toast.error('問題の作成に失敗')
    return null
  }
}

/* ── Code suggestions for (subject, level) ── */

function useCodeSuggestions(projectId: string | undefined, subject: string, level: string) {
  const { data: problems = [] } = useQuery({
    queryKey: ['problems-for-suggestions', projectId],
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.problems.$get({ query: { project_id: projectId! } }))
      return json.data
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })

  return useMemo(() => {
    if (!subject || !level) {
      return { suggestions: [] as string[], checkpointMap: {} as Record<string, string>, nameMap: {} as Record<string, string> }
    }
    const filtered = problems.filter((p) => p.levelId === level && p.subjectId === subject)
    const suggestions = filtered.map((p) => p.code).sort()
    const checkpointMap: Record<string, string> = {}
    const nameMap: Record<string, string> = {}
    for (const p of filtered) {
      if (p.checkpoint) checkpointMap[p.code] = p.checkpoint
      if (p.name) nameMap[p.code] = p.name
    }
    return { suggestions, checkpointMap, nameMap }
  }, [problems, subject, level])
}

/* ── Tag-name → id map (shared across dialog instances) ── */

function useTagMap() {
  const { data: tags = [] } = useQuery({
    queryKey: ['tags-map'],
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.tags.$get())
      return json.data
    },
    staleTime: 5 * 60_000,
  })
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tags) m.set(t.name, t.id)
    return m
  }, [tags])
}

const DEFAULT_FORM: AnswerFormData = {
  subject: '', level: '', code: '', duration: '', status: 'Miss', reviews: [],
}

/** Shape returned by useAnswerForm / useEditAnswerForm */
export type AnswerFormHandle = {
  open: boolean
  setOpen: (o: boolean) => void
  form: UseFormReturn<AnswerFormData>
  reviewsField: UseFieldArrayReturn<AnswerFormData, 'reviews', '_key'>
  codeSuggestions: string[]
  checkpointMap: Record<string, string>
  nameMap: Record<string, string>
  saving: boolean
}

/* ── Create answer form ── */

export function useAnswerForm(onSaved: (problemId: string) => void) {
  const { currentProject, subjects, levels, statuses } = useProject()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problemId, setProblemId] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)

  const [origSubject, setOrigSubject] = useState('')
  const [origLevel, setOrigLevel] = useState('')
  const [origCode, setOrigCode] = useState('')

  const form = useForm<AnswerFormData>({
    resolver: zodResolver(answerFormSchema),
    defaultValues: DEFAULT_FORM,
  })
  const reviewsField = useFieldArray({ control: form.control, name: 'reviews', keyName: '_key' })

  const subject = form.watch('subject')
  const level = form.watch('level')

  const { suggestions: codeSuggestions, checkpointMap, nameMap } = useCodeSuggestions(
    currentProject?.id, subject, level,
  )
  const tagMap = useTagMap()

  function openForProblem(p: Problem & { answers: { date: string | null; status: string | null }[] }) {
    setProblemId(p.id)
    setProblem(p)
    setOrigSubject(p.subject_id)
    setOrigLevel(p.level_id)
    setOrigCode(p.code)
    form.reset({
      subject: p.subject_id,
      level: p.level_id,
      code: p.code,
      duration: '',
      status: nextStatus(p.answers, statuses),
      reviews: [],
    })
    setOpen(true)
  }

  function openBlank(defaults?: { status?: string }) {
    setProblemId(null)
    setProblem(null)
    setOrigSubject('')
    setOrigLevel('')
    setOrigCode('')
    form.reset({
      subject: subjects[0]?.id ?? '',
      level: levels[0]?.id ?? '',
      code: '',
      duration: '',
      status: defaults?.status ?? 'Miss',
      reviews: [],
    })
    setOpen(true)
  }

  async function save(overrides?: { date?: string }) {
    if (saving) return
    if (!currentProject) return
    const valid = await form.trigger()
    if (!valid) {
      const first = Object.values(form.formState.errors)[0]
      if (first && typeof first.message === 'string') toast.error(first.message)
      return
    }
    const data = form.getValues()
    setSaving(true)

    const unchanged = problemId && data.subject === origSubject && data.level === origLevel && data.code.trim() === origCode.trim()
    const pid = unchanged
      ? problemId!
      : await resolveProblemId(currentProject.id, data.subject, data.level, data.code)
    if (!pid) { setSaving(false); return }

    const statusId = statuses.find((s) => s.name === data.status)?.id ?? null
    const durationSec = data.duration ? durationToSeconds(data.duration) : null

    try {
      const ansRes = await unwrap(
        rpc.api.v1.answers.$post({
          json: {
            problem_id: pid,
            date: overrides?.date ?? new Date().toISOString(),
            answer_status_id: statusId,
            duration: durationSec,
          },
        }),
      )
      const newAnswerId = ansRes.data.id

      for (const r of data.reviews) {
        if (!r.content.trim()) continue
        const revRes = await unwrap(
          rpc.api.v1.reviews.$post({
            json: { answer_id: newAnswerId, content: r.content.trim() },
          }),
        )
        const revId = revRes.data.id
        const tagId = tagMap.get(r.type)
        if (tagId) {
          await unwrap(
            rpc.api.v1.reviews[":id"].tags.$post({
              param: { id: revId },
              json: { tag_id: tagId },
            }),
          )
        }
      }

      toast.success('解答を登録しました')
      setOpen(false)
      onSaved(pid)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '登録に失敗')
    } finally {
      setSaving(false)
    }
  }

  return {
    open, setOpen,
    problemId, setProblemId,
    problem, setProblem,
    form,
    reviewsField,
    codeSuggestions, checkpointMap, nameMap,
    saving,
    openForProblem, openBlank,
    save,
  }
}

/* ── Edit answer form ── */

export function useEditAnswerForm(onSaved: (problemId: string) => void) {
  const { currentProject, statuses } = useProject()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [answerId, setAnswerId] = useState('')
  const [problemId, setProblemId] = useState('')

  const [origSubject, setOrigSubject] = useState('')
  const [origLevel, setOrigLevel] = useState('')
  const [origCode, setOrigCode] = useState('')

  const form = useForm<AnswerFormData>({
    resolver: zodResolver(answerFormSchema),
    defaultValues: DEFAULT_FORM,
  })
  const reviewsField = useFieldArray({ control: form.control, name: 'reviews', keyName: '_key' })

  const subject = form.watch('subject')
  const level = form.watch('level')

  const { suggestions: codeSuggestions, checkpointMap, nameMap } = useCodeSuggestions(
    currentProject?.id, subject, level,
  )
  const tagMap = useTagMap()

  function openFor(answer: AnswerWithReviews, prob: Problem) {
    setAnswerId(answer.id)
    setProblemId(prob.id)
    setOrigSubject(prob.subject_id)
    setOrigLevel(prob.level_id)
    setOrigCode(prob.code)
    form.reset({
      subject: prob.subject_id,
      level: prob.level_id,
      code: prob.code,
      status: answer.status ?? 'Miss',
      duration: answer.duration ?? '',
      reviews: answer.reviews.map((r) => ({
        id: r.id,
        type: (r.review_type ?? '不理解') as ReviewType,
        content: r.content,
      })),
    })
    setOpen(true)
  }

  async function save() {
    if (saving) return
    if (!currentProject) return
    const valid = await form.trigger()
    if (!valid) {
      const first = Object.values(form.formState.errors)[0]
      if (first && typeof first.message === 'string') toast.error(first.message)
      return
    }
    const data = form.getValues()
    setSaving(true)

    const unchanged = data.subject === origSubject && data.level === origLevel && data.code.trim() === origCode.trim()
    const pid = unchanged
      ? problemId
      : await resolveProblemId(currentProject.id, data.subject, data.level, data.code)
    if (!pid) { setSaving(false); return }

    const statusId = statuses.find((s) => s.name === data.status)?.id ?? null
    const durationSec = data.duration ? durationToSeconds(data.duration) : null

    try {
      await unwrap(
        rpc.api.v1.answers[":id"].$put({
          param: { id: answerId },
          json: { answer_status_id: statusId, duration: durationSec },
        }),
      )

      // Sync reviews
      const reviewsRes = await unwrap(
        rpc.api.v1.reviews.$get({ query: { answer_id: answerId } }),
      )
      const currentReviews = reviewsRes.data
      const tagsRes = await unwrap(rpc.api.v1["review-tags"].$get())
      const currentReviewTags = tagsRes.data

      const existingIds = data.reviews.filter((r) => r.id).map((r) => r.id!)
      const toDelete = currentReviews.filter((r) => !existingIds.includes(r.id))
      for (const r of toDelete) {
        await unwrap(rpc.api.v1.reviews[":id"].$delete({ param: { id: r.id } }))
      }

      for (const r of data.reviews) {
        if (r.id) {
          await unwrap(
            rpc.api.v1.reviews[":id"].$put({
              param: { id: r.id },
              json: { content: r.content.trim() },
            }),
          )
          const oldTags = currentReviewTags.filter((rt) => rt.reviewId === r.id)
          for (const ot of oldTags) {
            await unwrap(
              rpc.api.v1.reviews[":id"].tags[":tagId"].$delete({
                param: { id: r.id, tagId: ot.tagId },
              }),
            )
          }
          const tagId = tagMap.get(r.type)
          if (tagId) {
            await unwrap(
              rpc.api.v1.reviews[":id"].tags.$post({
                param: { id: r.id },
                json: { tag_id: tagId },
              }),
            )
          }
        } else if (r.content.trim()) {
          const res = await unwrap(
            rpc.api.v1.reviews.$post({
              json: { answer_id: answerId, content: r.content.trim() },
            }),
          )
          const newRevId = res.data.id
          const tagId = tagMap.get(r.type)
          if (tagId) {
            await unwrap(
              rpc.api.v1.reviews[":id"].tags.$post({
                param: { id: newRevId },
                json: { tag_id: tagId },
              }),
            )
          }
        }
      }

      toast.success('解答を更新しました')
      setOpen(false)
      onSaved(pid)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新に失敗')
    } finally {
      setSaving(false)
    }
  }

  return {
    open, setOpen,
    form,
    reviewsField,
    codeSuggestions, checkpointMap, nameMap,
    saving,
    openFor,
    save,
  }
}
