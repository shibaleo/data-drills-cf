import { Hono } from "hono";
import { db } from "../lib/db/index.js";
import { problem, problemFile, oauthToken, subject, level } from "../lib/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { getDriveClient } from "../lib/google-oauth.js";
import { downloadDriveFile } from "../lib/drive-helpers.js";
import { extractAndLabel, mergePdfs } from "../lib/pdf-processing.js";

const app = new Hono();

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

// ── POST /export — merge problem pages into a single PDF ──

app.post("/export", async (c) => {
  const body = await c.req.json();
  const { problem_ids } = body as { problem_ids: string[] };

  if (!problem_ids?.length) {
    return c.json({ error: "problem_ids is required" }, 400);
  }

  const { drive } = await getDrive();

  // Load problems + their files + subject/level for labels
  const problems = await db
    .select()
    .from(problem)
    .where(inArray(problem.id, problem_ids));
  const files = await db
    .select()
    .from(problemFile)
    .where(inArray(problemFile.problemId, problem_ids));

  // Build subject/level name maps
  const subjectIds = [...new Set(problems.map((p) => p.subjectId).filter(Boolean))] as string[];
  const levelIds = [...new Set(problems.map((p) => p.levelId).filter(Boolean))] as string[];
  const subjectMap = new Map(
    subjectIds.length
      ? (await db.select().from(subject).where(inArray(subject.id, subjectIds))).map((s) => [s.id, s.name])
      : [],
  );
  const levelMap = new Map(
    levelIds.length
      ? (await db.select().from(level).where(inArray(level.id, levelIds))).map((l) => [l.id, l.name])
      : [],
  );

  // Sort problems by code for consistent ordering
  problems.sort((a, b) => a.code.localeCompare(b.code));

  // Build work items (problem + file + label). Skip problems whose file has
  // no explicit page list — the external pipeline is responsible for
  // populating problem_pages on every problem_file.
  const work = problems.flatMap((p) => {
    const pf = files.find((f) => f.problemId === p.id);
    if (!pf) return [];
    const pages = (pf.problemPages as number[]) ?? [];
    if (pages.length === 0) return [];
    const subName = (p.subjectId && subjectMap.get(p.subjectId)) || "";
    const lvlName = (p.levelId && levelMap.get(p.levelId)) || "";
    return [{ pf, label: `${subName}_${lvlName}_${p.code}`, pages }];
  });

  // Download + extract with concurrency limit (avoid Drive API rate limits)
  const parts = await pMap(work, async (w) => {
    const raw = await downloadDriveFile(drive, w.pf.gdriveFileId);
    const buf = new Uint8Array(raw);
    return extractAndLabel(buf, w.pages, w.label);
  }, 5);

  if (parts.length === 0) {
    return c.json({ error: "No problem pages found" }, 404);
  }

  const merged = await mergePdfs(parts.map((p) => p.buffer as ArrayBuffer));
  const today = new Date().toISOString().slice(0, 10);

  return new Response(Buffer.from(merged), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="exported-${today}.pdf"`,
    },
  });
});

export default app;
