'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ReviewType } from '@/lib/types'
import { REVIEW_TYPES } from '@/lib/types'
import { StatusTag } from '@/components/color-tags'
import { Markdown } from '@/components/markdown'
import { CodeCombobox } from '@/components/code-combobox'
import { useProject } from '@/hooks/use-project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkdownEditor } from '@/components/markdown-editor'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

export interface ReviewRow {
  id?: string
  _key?: string
  type: ReviewType
  content: string
}

interface AnswerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  // problem fields (always editable)
  subject: string
  onSubjectChange: (s: string) => void
  level: string
  onLevelChange: (l: string) => void
  code: string
  onCodeChange: (c: string) => void
  codeSuggestions?: string[]
  checkpointMap?: Record<string, string>
  nameMap?: Record<string, string>
  // answer fields
  status: string
  onStatusChange: (s: string) => void
  duration: string
  onDurationChange: (d: string) => void
  // reviews
  reviews: ReviewRow[]
  onAddReview: () => void
  onUpdateReview: (index: number, field: 'type' | 'content', value: string) => void
  onRemoveReview: (index: number) => void
  // save
  saveLabel: string
  onSave: () => void | Promise<void>
}

export function AnswerDialog({
  open,
  onOpenChange,
  title,
  subject,
  onSubjectChange,
  level,
  onLevelChange,
  code,
  onCodeChange,
  codeSuggestions = [],
  checkpointMap = {},
  nameMap = {},
  status,
  onStatusChange,
  duration,
  onDurationChange,
  reviews,
  onAddReview,
  onUpdateReview,
  onRemoveReview,
  saveLabel,
  onSave,
}: AnswerDialogProps) {
  const { currentProject, subjects, levels, statuses } = useProject()
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  if (!currentProject) return null

  const cpName = nameMap[code]
  const cpText = checkpointMap[code]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 overflow-y-auto min-h-0">
          {/* Problem fields — always editable */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>科目</Label>
              <Select value={subject} onValueChange={onSubjectChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>レベル</Label>
              <Select value={level} onValueChange={onLevelChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>コード</Label>
              <CodeCombobox value={code} onChange={onCodeChange} suggestions={codeSuggestions} />
            </div>
          </div>

          {/* Checkpoint info */}
          {(cpName || cpText) && (
            <div className="grid gap-1">
              <Label className="text-muted-foreground">チェックポイント</Label>
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
                {cpName && <div className="text-sm font-medium text-foreground">{cpName}</div>}
                {cpText && (
                  <div className="text-xs text-muted-foreground">
                    <Markdown>{cpText}</Markdown>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>ステータス</Label>
              <Select value={status} onValueChange={(v) => onStatusChange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      <StatusTag status={s.name} color={s.color} opaque />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>所要時間</Label>
              <Input
                placeholder="例: 00:30:00"
                value={duration}
                onChange={(e) => onDurationChange(e.target.value)}
              />
            </div>
          </div>

          {/* Reviews */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label>レビュー</Label>
              <button
                type="button"
                onClick={onAddReview}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Plus className="size-3" /> 追加
              </button>
            </div>
            {reviews.map((r, i) => (
              <div key={r._key ?? r.id ?? i} className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  <Select value={r.type} onValueChange={(v) => onUpdateReview(i, 'type', v)}>
                    <SelectTrigger className="w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEW_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveReview(i)}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    &times;
                  </Button>
                </div>
                <MarkdownEditor
                  compact
                  defaultValue={r.content}
                  onChange={(val) => onUpdateReview(i, 'content', val)}
                  placeholder="振り返り内容"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={handleSave} disabled={saving}>{saveLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
