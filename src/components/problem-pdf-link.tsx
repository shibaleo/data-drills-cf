'use client'

import { lazy, Suspense, useState } from 'react'
import { Eye, EyeOff, FileText, Link, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProblemFile } from '@/lib/types'
import { useDrivePicker } from '@/lib/use-drive-picker'

const PdfViewer = lazy(() =>
  import('@/components/pdf-viewer').then((m) => ({ default: m.PdfViewer })),
)

/**
 * ヘッダー用: PDF がある場合にアイコンリンク（別タブで開く）
 */
export function ProblemPdfHeaderLink({ problemFiles }: { problemFiles?: ProblemFile[] }) {
  const file = problemFiles?.[0]
  if (!file) return null
  return (
    <a
      href={`/api/drive/file?id=${file.gdrive_file_id}`}
      target="_blank"
      rel="noopener noreferrer"
      title="PDF を別タブで表示"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-primary transition-colors"
    >
      <FileText className="size-3.5" />
    </a>
  )
}

interface ProblemPdfLinkProps {
  problemFiles?: ProblemFile[]
  problemId: string
  onLinked?: (problemId: string) => void
  /** Buttons rendered at the left of the row */
  startActions?: React.ReactNode
  /** Buttons rendered at the right of the row */
  endActions?: React.ReactNode
}

/**
 * カードボトム用: アコーディオンで PDF をカード内に描画 / PDF 登録ボタン
 */
export function ProblemPdfLink({ problemFiles, problemId, onLinked, startActions, endActions }: ProblemPdfLinkProps) {
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const { openPicker } = useDrivePicker()
  const file = problemFiles?.[0]

  async function handlePickPdf() {
    try {
      setLinking(true)
      const picked = await openPicker()
      if (!picked) return

      const res = await fetch('/api/drive/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          gdriveFileId: picked.fileId,
          fileName: picked.fileName,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to link PDF')
      }
      toast.success('PDF を紐づけました')
      onLinked?.(problemId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF の紐づけに失敗しました')
    } finally {
      setLinking(false)
    }
  }

  function handleTogglePdf() {
    setOpen((v) => !v)
  }

  if (file) {
    return (
      <div>
        <div className="flex items-center">
          {startActions}
          <button
            type="button"
            onClick={handlePickPdf}
            disabled={linking}
            title="PDF を再連携"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-50"
          >
            {linking ? <Loader2 className="size-3.5 animate-spin" /> : <Link className="size-3.5" />}
          </button>
          <div className="ml-auto flex items-center">
            <a
              href={`/api/drive/file?id=${file.gdrive_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="PDF を別タブで表示"
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-primary transition-colors"
            >
              <FileText className="size-3.5" />
            </a>
            <button
              type="button"
              onClick={handleTogglePdf}
              title={open ? 'PDF を閉じる' : 'PDF を表示'}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary/70 hover:text-primary transition-colors"
            >
              {open ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              <span>{open ? 'hide' : 'show'}</span>
            </button>
            {endActions}
          </div>
        </div>
        {open && (
          <div className="mt-2 -mb-6 -mx-6 w-[calc(100%+3rem)] rounded-t-md rounded-b-lg border-t border-x border-border overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
              <PdfViewer
                url={`/api/drive/file?id=${file.gdrive_file_id}`}
                title={file.file_name}
              />
            </Suspense>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center">
      {startActions}
      <button
        type="button"
        onClick={handlePickPdf}
        disabled={linking}
        title="PDF を登録"
        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-50"
      >
        {linking ? <Loader2 className="size-3.5 animate-spin" /> : <Link className="size-3.5" />}
      </button>
      {endActions && <div className="ml-auto flex items-center">{endActions}</div>}
    </div>
  )
}
