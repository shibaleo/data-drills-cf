"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  pdfExportLabel,
  type PdfExportPhase,
  type PdfExportUpstream,
} from "@/hooks/use-pdf-export";

/**
 * Shared PDF export trigger button. Used by /plan, /review, /scopes,
 * /throughput tables — each holds its own `usePdfExport` state and wires
 * the matching props here.
 */
export function PdfExportButton(props: {
  selectedCount: number;
  exporting: boolean;
  phase: PdfExportPhase;
  upstream: PdfExportUpstream;
  onClick: () => void;
  className?: string;
}) {
  const { selectedCount, exporting, phase, upstream, onClick, className } = props;
  if (selectedCount === 0) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className={className ?? "h-6 text-[10px] px-2"}
      onClick={onClick}
      disabled={exporting}
    >
      {exporting ? (
        <Loader2 className="size-3 mr-1 animate-spin" />
      ) : (
        <Download className="size-3 mr-1" />
      )}
      {exporting
        ? pdfExportLabel(phase, upstream, "Exporting…")
        : `PDF (${selectedCount})`}
    </Button>
  );
}
