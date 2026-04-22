'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`

interface PdfViewerProps {
  url: string
  title?: string
}

export function PdfViewer({ url, title }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const options = useMemo(() => ({ cMapUrl: CMAP_URL, cMapPacked: true }), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={{ maxHeight: '70vh' }}
      title={title}
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
        error={
          <div className="text-center text-sm text-destructive py-8">
            PDF の読み込みに失敗しました
          </div>
        }
        options={options}
      >
        {numPages &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i} className={i > 0 ? 'border-t-4 border-border' : undefined}>
              <Page
                pageNumber={i + 1}
                width={containerWidth || undefined}
                devicePixelRatio={Math.min(window.devicePixelRatio || 1, 3)}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
      </Document>
    </div>
  )
}
