/**
 * PDF processing utilities for the export pipeline — extract specified
 * pages from source PDFs (labelled) and merge them into one combined PDF.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Extract pages + label (pdf-lib)
// ---------------------------------------------------------------------------

const _fontCache = new Map<string, Buffer>();

function loadFontBytes(fontPath: string): Buffer {
  const cached = _fontCache.get(fontPath);
  if (cached) return cached;
  const bytes = fs.readFileSync(fontPath);
  _fontCache.set(fontPath, bytes);
  return bytes;
}

/**
 * Extract specified pages from a PDF and add a label in the top-left corner.
 */
export async function extractAndLabel(
  pdfBuffer: ArrayBuffer | Uint8Array,
  pageIndices: number[],
  label: string,
  fontPath: string,
): Promise<Uint8Array> {
  const bytes = pdfBuffer instanceof Uint8Array
    ? new Uint8Array(pdfBuffer)
    : new Uint8Array(pdfBuffer);
  const srcDoc = await PDFDocument.load(bytes);
  const dstDoc = await PDFDocument.create();
  dstDoc.registerFontkit(fontkit);

  const fontBytes = loadFontBytes(fontPath);
  const font = await dstDoc.embedFont(fontBytes);

  const copiedPages = await dstDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    dstDoc.addPage(page);
    const { height } = page.getSize();
    page.drawText(label, {
      x: 10,
      y: height - 15,
      size: 9,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  return dstDoc.save();
}

// ---------------------------------------------------------------------------
// Merge multiple PDFs
// ---------------------------------------------------------------------------

export async function mergePdfs(
  pdfBuffers: ArrayBuffer[],
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}
