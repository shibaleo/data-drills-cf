"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { rpc } from "@/lib/rpc-client";

export type PdfExportPhase = "waking" | "generating" | "downloading" | null;

/**
 * PDF エクスポート共通フック (Render PDF service 経由)。
 * /scopes, /review, /plan の表で同一フローを使う。
 *
 * 戦略: health → POST /pdf-export → blob ダウンロード。
 * Render が free plan で cold start するので health を先に叩いて warm 化を兼ねる。
 */
export function usePdfExport(filenamePrefix: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [phase, setPhase] = useState<PdfExportPhase>(null);

  const toggle = useCallback((problemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[]) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected(new Set()), []);

  const exportPdf = useCallback(async (dateLabel: string) => {
    if (selected.size === 0) return;
    setExporting(true);
    setPhase("waking");
    try {
      const healthRes = await rpc.api.v1["pdf-export"].health.$get();
      if (!healthRes.ok) {
        const body = (await healthRes.json().catch(() => ({ error: healthRes.statusText }))) as { error?: string };
        throw new Error(body.error || "PDF service unhealthy");
      }
      setPhase("generating");
      const res = await rpc.api.v1["pdf-export"].$post({
        json: { problem_ids: Array.from(selected) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(body.error || "Export failed");
      }
      setPhase("downloading");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}-${dateLabel}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDFエクスポート完了");
    } catch (err) {
      toast.error(`エクスポート失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
      setPhase(null);
    }
  }, [selected, filenamePrefix]);

  return { selected, toggle, setAll, clear, exporting, phase, exportPdf };
}
