/**
 * PDF processing utilities — server-side only.
 *
 * Ports the Python classify_pages / pages_to_keep logic to Node.js,
 * using pdfjs-dist for text extraction and pdf-lib for page manipulation.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// 1. Filename parsing
// ---------------------------------------------------------------------------

/** Common result from all filename parsers */
export interface ParsedPdfFilename {
  /** e.g. "010", "019-2", "01" — used as problem code */
  code: string;
  /** e.g. "現金" — content from filename, used as name hint */
  subtopic: string;
  /** "簿記" or "財表" — DB subject name for matching */
  subjectName: string;
  /** DB level code: "training" | "theme-exec" | etc. */
  levelCode: string;
  /** "problem" | "answer-sheet" — for skill-test which has separate files */
  fileRole: "problem" | "answer-sheet";
}

// ── Training ──
// トレーニング_010_簿記一巡の手続ー１_(概要、...)（簿記論）_2026.pdf
const TRAINING_RE =
  /^トレーニング_([\d][\d\-]*)_[^_(]+_\((.+?)\)（(簿記論・財表|簿記論|財表)）_\d+(?:\s*\(\d+\))?\.pdf$/;

export function parseTrainingFilename(
  name: string,
): ParsedPdfFilename | null {
  const m = TRAINING_RE.exec(name);
  if (!m) return null;
  return {
    code: m[1],
    subtopic: m[2],
    subjectName:
      m[3] === "簿記論" || m[3] === "簿記論・財表" ? "簿記" : "財表",
    levelCode: "training",
    fileRole: "problem",
  };
}

// ── Theme-wise exercise (テーマ別演習) ──
// 2026_簿記_テーマ別演習01(一般商品売買１).pdf
// 2026_財表_テーマ別演習01(財務会計総論Ⅰ、会社計算規則).pdf
const THEME_RE =
  /^\d{4}_(簿記|財表)_テーマ別演習(\d+)\((.+?)\)\.pdf$/;

export function parseThemeExerciseFilename(
  name: string,
): ParsedPdfFilename | null {
  const m = THEME_RE.exec(name);
  if (!m) return null;
  return {
    code: m[2],          // "01", "02"
    subtopic: m[3],      // "一般商品売買１"
    subjectName: m[1],   // "簿記" or "財表"
    levelCode: "theme-exec",
    fileRole: "problem",
  };
}

// ── Skill test (実力テスト) ──
// 2025簿記論_実力テスト_第１回_01問題.pdf
// 2025財表_実力テスト_第１回_02答案用紙.pdf
const SKILL_RE =
  /^\d{4}(簿記論|財表)_実力テスト_第([０-９\d]+)回_(\d+)(問題|答案用紙)\.pdf$/;

/** Convert full-width digits to half-width */
function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
}

export function parseSkillTestFilename(
  name: string,
): ParsedPdfFilename | null {
  const m = SKILL_RE.exec(name);
  if (!m) return null;
  const round = normalizeDigits(m[2]); // "１" → "1"
  return {
    code: round,             // "1" — round number is the problem code
    subtopic: `第${round}回`,
    subjectName: m[1] === "簿記論" ? "簿記" : "財表",
    levelCode: "skill-test",
    fileRole: m[4] === "問題" ? "problem" : "answer-sheet",
  };
}

/**
 * Try all parsers in order. Returns the first match or null.
 */
export function parsePdfFilename(name: string): ParsedPdfFilename | null {
  return (
    parseTrainingFilename(name) ??
    parseThemeExerciseFilename(name) ??
    parseSkillTestFilename(name)
  );
}

// ---------------------------------------------------------------------------
// 2. Page classification (pdfjs-dist, server-side)
// ---------------------------------------------------------------------------

export type PageType = "cover" | "problem" | "answer";

/**
 * Initialise pdfjs-dist for server-side use (call once, idempotent).
 */
async function getPdfjsLib() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
  }
  return pdfjsLib;
}

/**
 * Extract the first N visual lines from a PDF page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTopLines(items: any[], count: number): string[] {
  const buckets = new Map<number, string[]>();
  for (const item of items) {
    const str: string = item.str ?? "";
    if (!str.trim()) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 3) * 3;
    const arr = buckets.get(y) ?? [];
    arr.push(str);
    buckets.set(y, arr);
  }
  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, strs]) => strs.join("").trim())
    .filter((l) => l.length > 0);
  return sorted.slice(0, count);
}

export async function classifyPages(
  pdfBuffer: ArrayBuffer,
): Promise<PageType[]> {
  const pdfjsLib = await getPdfjsLib();

  const { pathToFileURL } = await import("url");
  const fontDir = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl: pathToFileURL(fontDir).href,
  }).promise;

  const types: PageType[] = [];
  let currentType: PageType = "cover";

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const lines = extractTopLines(tc.items, 6);

    if (lines.some((l) => l.startsWith("問題"))) {
      currentType = "problem";
    } else if (lines.some((l) => l.startsWith("解答"))) {
      currentType = "answer";
    }

    types.push(i === 1 && currentType === "cover" ? "cover" : currentType);
  }

  return types;
}

// ---------------------------------------------------------------------------
// 3. Problem page indices (mirrors Python pages_to_keep)
// ---------------------------------------------------------------------------

/**
 * Return 0-indexed page numbers to keep (problem pages only, skip cover).
 */
export function problemPageIndices(types: PageType[]): number[] {
  const keep: number[] = [];
  let inProblemBlock = false;
  for (let i = 0; i < types.length; i++) {
    if (i === 0) continue; // always skip cover
    if (types[i] === "problem") {
      inProblemBlock = true;
      keep.push(i);
    } else if (types[i] === "answer") {
      inProblemBlock = false;
    } else {
      if (inProblemBlock) keep.push(i);
    }
  }
  return keep;
}

// ---------------------------------------------------------------------------
// 4. Extract pages + label (pdf-lib)
// ---------------------------------------------------------------------------

let _fontBytes: Buffer | null = null;

function loadFontBytes(): Buffer {
  if (!_fontBytes) {
    const fontPath = path.join(process.cwd(), "assets/fonts/yumin.ttf");
    _fontBytes = fs.readFileSync(fontPath);
  }
  return _fontBytes;
}

/**
 * Extract specified pages from a PDF and add a label in the top-left corner.
 */
export async function extractAndLabel(
  pdfBuffer: ArrayBuffer | Uint8Array,
  pageIndices: number[],
  label: string,
): Promise<Uint8Array> {
  const bytes = pdfBuffer instanceof Uint8Array
    ? new Uint8Array(pdfBuffer)
    : new Uint8Array(pdfBuffer);
  const srcDoc = await PDFDocument.load(bytes);
  const dstDoc = await PDFDocument.create();
  dstDoc.registerFontkit(fontkit);

  const fontBytes = loadFontBytes();
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
// 5. Merge multiple PDFs
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
