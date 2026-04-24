'use client'

import { useState } from 'react'
import { Controller, type UseFormReturn, type UseFieldArrayReturn } from 'react-hook-form'
import { Plus } from 'lucide-react'
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
import type { AnswerFormData } from '@/lib/schemas/answer-form'
import type { ReviewType } from '@/lib/types'

interface AnswerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  form: UseFormReturn<AnswerFormData>
  reviewsField: UseFieldArrayReturn<AnswerFormData, 'reviews', '_key'>
  codeSuggestions?: string[]
  checkpointMap?: Record<string, string>
  nameMap?: Record<string, string>
  saveLabel: string
  onSave: () => void | Promise<void>
}

export function AnswerDialog({
  open,
  onOpenChange,
  title,
  form,
  reviewsField,
  codeSuggestions = [],
  checkpointMap = {},
  nameMap = {},
  saveLabel,
  onSave,
}: AnswerDialogProps) {
  const { currentProject, subjects, levels, statuses } = useProject()
  const [saving, setSaving] = useState(false)

  const code = form.watch('code')

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
          {/* Problem fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>科目</Label>
              <Controller
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>レベル</Label>
              <Controller
                control={form.control}
                name="level"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>コード</Label>
              <Controller
                control={form.control}
                name="code"
                render={({ field }) => (
                  <CodeCombobox value={field.value} onChange={field.onChange} suggestions={codeSuggestions} />
                )}
              />
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
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
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
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>所要時間</Label>
              <Input placeholder="例: 00:30:00" {...form.register('duration')} />
            </div>
          </div>

          {/* Reviews */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label>レビュー</Label>
              <button
                type="button"
                onClick={() =>
                  reviewsField.append({ type: '不理解' as ReviewType, content: '' })
                }
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Plus className="size-3" /> 追加
              </button>
            </div>
            {reviewsField.fields.map((r, i) => (
              <div key={r._key} className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  <Controller
                    control={form.control}
                    name={`reviews.${i}.type`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REVIEW_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => reviewsField.remove(i)}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    &times;
                  </Button>
                </div>
                <Controller
                  control={form.control}
                  name={`reviews.${i}.content`}
                  render={({ field }) => (
                    <MarkdownEditor
                      compact
                      defaultValue={field.value}
                      onChange={field.onChange}
                      placeholder="振り返り内容"
                    />
                  )}
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
