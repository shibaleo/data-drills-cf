"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { rpc } from "@/lib/rpc-client";

export type PdfExportPhase = "preflight" | "rendering" | "downloading" | null;
export type PdfExportUpstream = "lambda" | "render" | null;

/**
 * PDF エクスポート共通フック。/scopes, /review, /plan, /throughput で共有。
 *
 * フロー:
 *   1. preflight  : health check (Render fallback の warm-up を兼ねる)
 *   2. rendering  : CF Worker proxy が Lambda Invoke API を試行
 *      - 成功 → Lambda が S3 に PDF を PUT、proxy が S3 GET で取得
 *      - 失敗 → Render free plan にフォールバック
 *   3. downloading: client が blob を保存
 *
 * upstream はレスポンスヘッダ `X-PDF-Upstream` から判定し、UI 側で
 * 「Lambda 経由」「Render フォールバック」のどちらが使われたかを表示する。
 */
export function usePdfExport(filenamePrefix: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [phase, setPhase] = useState<PdfExportPhase>(null);
  const [upstream, setUpstream] = useState<PdfExportUpstream>(null);

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
    setPhase("preflight");
    setUpstream(null);
    try {
      const healthRes = await rpc.api.v1["pdf-export"].health.$get();
      if (!healthRes.ok) {
        const body = (await healthRes.json().catch(() => ({ error: healthRes.statusText }))) as { error?: string };
        throw new Error(body.error || "PDF service unhealthy");
      }
      setPhase("rendering");
      const res = await rpc.api.v1["pdf-export"].$post({
        json: { problem_ids: Array.from(selected) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(body.error || "Export failed");
      }
      const upstreamHeader = res.headers.get("X-PDF-Upstream") ?? res.headers.get("x-pdf-upstream");
      const resolvedUpstream: PdfExportUpstream =
        upstreamHeader === "lambda" || upstreamHeader === "render" ? upstreamHeader : null;
      setUpstream(resolvedUpstream);
      setPhase("downloading");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}-${dateLabel}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      const upstreamLabel = resolvedUpstream === "render"
        ? " (Render fallback)"
        : resolvedUpstream === "lambda"
          ? " (Lambda)"
          : "";
      toast.success(`PDF export complete${upstreamLabel}`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
      setPhase(null);
      setUpstream(null);
    }
  }, [selected, filenamePrefix]);

  return { selected, toggle, setAll, clear, exporting, phase, upstream, exportPdf };
}

/**
 * Button label per phase / upstream. UI 文言は英語統一 (CLAUDE.md 規約)。
 */
export function pdfExportLabel(
  phase: PdfExportPhase,
  upstream: PdfExportUpstream,
  fallback = "PDF",
): string {
  if (phase === "preflight") return "Checking service…";
  // 応答前は upstream 不明。楽観的に Lambda 試行中表示。
  if (phase === "rendering") return "Lambda processing…";
  if (phase === "downloading") {
    if (upstream === "lambda") return "Lambda → downloading…";
    if (upstream === "render") return "Render fallback → downloading…";
    return "Downloading…";
  }
  return fallback;
}
