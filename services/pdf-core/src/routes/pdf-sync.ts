/**
 * /export — pure PDF assembly endpoint.
 *
 * Architecture (2026-06-10〜): cf-worker that calls this endpoint pre-resolves
 * problem + file + subject/level into a flat `items` payload. This service
 * does not touch the data-drills schema (no problem/subject/level tables) —
 * only oauth_token is read for Google Drive credentials. As a result schema
 * drift on the data-drills side cannot break this service.
 */
import { Hono } from "hono";
import { db } from "../lib/db/index.js";
import { oauthToken } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getDriveClient } from "../lib/google-oauth.js";
import { downloadDriveFile } from "../lib/drive-helpers.js";
import { extractAndLabel, mergePdfs } from "../lib/pdf-processing.js";
import type { AppOptions } from "../app.js";

type ExportItem = { label: string; gdrive_file_id: string; pages: number[] };
type ExportInput = { items: ExportItem[]; filename_stem?: string };

function parseInput(raw: unknown): ExportInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be an object" };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items) || o.items.length === 0) return { error: "items required" };
  if (o.items.length > 100) return { error: "too many items (max 100)" };
  const items: ExportItem[] = [];
  for (const it of o.items) {
    if (!it || typeof it !== "object") return { error: "invalid item" };
    const r = it as Record<string, unknown>;
    if (typeof r.label !== "string" || typeof r.gdrive_file_id !== "string") {
      return { error: "item.label / gdrive_file_id required" };
    }
    if (!Array.isArray(r.pages) || r.pages.length === 0
      || !r.pages.every((p) => typeof p === "number" && p > 0)) {
      return { error: "item.pages must be positive ints" };
    }
    items.push({ label: r.label, gdrive_file_id: r.gdrive_file_id, pages: r.pages as number[] });
  }
  const stem = typeof o.filename_stem === "string" ? o.filename_stem : undefined;
  return { items, filename_stem: stem };
}

/** Run async tasks with concurrency limit */
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ── Helper: get authenticated Drive client ──

async function getDrive() {
  const [tokens] = await db
    .select()
    .from(oauthToken)
    .where(eq(oauthToken.provider, "google"))
    .limit(1);
  if (!tokens) throw new Error("Google Drive not connected");
  return getDriveClient({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.tokenExpiresAt,
  });
}

// ── POST /export — merge pre-resolved file pages into a single PDF ──

export function createPdfSyncRoutes(opts: AppOptions) {
  const app = new Hono();

  app.post("/export", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = parseInput(raw);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    const { items, filename_stem } = parsed;

    const { drive } = await getDrive();

    // Download + extract with concurrency limit (avoid Drive API rate limits)
    const parts = await pMap(items, async (w) => {
      const raw = await downloadDriveFile(drive, w.gdrive_file_id);
      const buf = new Uint8Array(raw);
      return extractAndLabel(buf, w.pages, w.label, opts.fontPath);
    }, 5);

    const merged = await mergePdfs(parts.map((p) => p.buffer as ArrayBuffer));
    const stem = filename_stem ?? `exported-${new Date().toISOString().slice(0, 10)}`;

    return new Response(Buffer.from(merged), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stem}.pdf"`,
      },
    });
  });

  return app;
}
