import { Hono } from "hono";
import { db } from "../lib/db/index.js";
import { project as projectTable, problem, problemFile, oauthToken, subject, level } from "../lib/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { getDriveClient } from "../lib/google-oauth.js";
import { listFolderPdfs, downloadDriveFile } from "../lib/drive-helpers.js";
import {
  parsePdfFilename,
  classifyPages,
  problemPageIndices,
  extractAndLabel,
  mergePdfs,
} from "../lib/pdf-processing.js";

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

// ── POST /scan — preview what will be linked (no changes made) ──

export interface ScanItem {
  driveFileId: string;
  fileName: string;
  code: string;
  subtopic: string;
  subjectName: string;
  levelCode: string;
  fileRole: "problem" | "answer-sheet";
  problemPages: number[];
  totalPages: number;
  action: "update" | "create";
  existingProblemId?: string;
  existingName?: string;
}

app.post("/scan", async (c) => {
  const body = await c.req.json();
  const { project_id } = body as { project_id: string };
  if (!project_id) {
    return c.json({ error: "project_id is required" }, 400);
  }

  // Resolve folder ID from project
  const [proj] = await db
    .select({ gdriveFolderId: projectTable.gdriveFolderId })
    .from(projectTable)
    .where(eq(projectTable.id, project_id))
    .limit(1);
  if (!proj?.gdriveFolderId) {
    return c.json({ error: "Project has no Google Drive folder configured" }, 400);
  }

  const { drive } = await getDrive();

  // 1. List PDFs in folder + subfolders
  const files = await listFolderPdfs(drive, proj.gdriveFolderId);

  // 2. Load existing problems + subjects + levels for matching
  const existingProblems = await db
    .select()
    .from(problem)
    .where(eq(problem.projectId, project_id));
  const subjects = await db
    .select()
    .from(subject)
    .where(eq(subject.projectId, project_id));
  const levels = await db
    .select()
    .from(level)
    .where(eq(level.projectId, project_id));

  const subjectNameToId = new Map(subjects.map((s) => [s.name, s.id]));
  const levelCodeToId = new Map(levels.map((l) => [l.code, l.id]));

  // Build lookup: "subjectId:levelId:code" → problem
  const keyToProblem = new Map(
    existingProblems.map((p) => [`${p.subjectId}:${p.levelId}:${p.code}`, p]),
  );

  // 3. Filter parseable files and process in parallel
  const parseable = files.flatMap((file) => {
    const parsed = parsePdfFilename(file.name);
    return parsed ? [{ file, parsed }] : [];
  });
  const skipped = files
    .filter((f) => !parsePdfFilename(f.name))
    .map((f) => f.name);

  // Download + classify with concurrency limit (avoid Drive API rate limits)
  const items: ScanItem[] = [];
  await pMap(parseable, async ({ file, parsed }) => {
    try {
      const buf = await downloadDriveFile(drive, file.id);
      const types = await classifyPages(buf);
      const pPages = problemPageIndices(types);

      const subjId = subjectNameToId.get(parsed.subjectName);
      const lvlId = levelCodeToId.get(parsed.levelCode);
      const existing =
        subjId && lvlId
          ? keyToProblem.get(`${subjId}:${lvlId}:${parsed.code}`)
          : undefined;

      items.push({
        driveFileId: file.id,
        fileName: file.name,
        code: parsed.code,
        subtopic: parsed.subtopic,
        subjectName: parsed.subjectName,
        levelCode: parsed.levelCode,
        fileRole: parsed.fileRole,
        problemPages: pPages,
        totalPages: types.length,
        action: existing ? "update" : "create",
        existingProblemId: existing?.id,
        existingName: existing?.name ?? undefined,
      });
    } catch (err) {
      console.error(`[pdf-sync] Failed to process ${file.name}:`, err);
      skipped.push(file.name);
    }
  }, 5);

  return c.json({ data: { items, skipped } });
});

// ── POST /apply — apply a single scan item ──

app.post("/apply", async (c) => {
  const body = await c.req.json();
  const { project_id, item } = body as {
    project_id: string;
    item: {
      driveFileId: string;
      fileName: string;
      code: string;
      subtopic: string;
      subjectName: string;
      levelCode: string;
      problemPages: number[];
      action: "update" | "create";
      existingProblemId?: string;
      name: string;
    };
  };

  if (!project_id || !item) {
    return c.json({ error: "project_id and item are required" }, 400);
  }

  // Resolve subject ID and level ID by levelCode
  const subjects = await db
    .select()
    .from(subject)
    .where(eq(subject.projectId, project_id));
  const subj = subjects.find((s) => s.name === item.subjectName);

  const levels = await db
    .select()
    .from(level)
    .where(eq(level.projectId, project_id));
  const lvl = levels.find((l) => l.code === item.levelCode);

  let problemId: string;

  if (item.action === "update" && item.existingProblemId) {
    await db
      .update(problem)
      .set({ name: item.name, updatedAt: new Date() })
      .where(eq(problem.id, item.existingProblemId));
    problemId = item.existingProblemId;
  } else {
    const [newProblem] = await db
      .insert(problem)
      .values({
        code: item.code,
        projectId: project_id,
        subjectId: subj?.id ?? null,
        levelId: lvl?.id ?? null,
        name: item.name,
      })
      .returning();
    problemId = newProblem.id;
  }

  // Upsert problem_file
  const existingFiles = await db
    .select()
    .from(problemFile)
    .where(eq(problemFile.problemId, problemId));

  const linked = existingFiles.find(
    (f) => f.gdriveFileId === item.driveFileId,
  );

  if (linked) {
    await db
      .update(problemFile)
      .set({
        fileName: item.fileName,
        problemPages: item.problemPages,
      })
      .where(eq(problemFile.id, linked.id));
  } else {
    await db.insert(problemFile).values({
      problemId,
      gdriveFileId: item.driveFileId,
      fileName: item.fileName,
      problemPages: item.problemPages,
    });
  }

  return c.json({ data: { ok: true, problemId } });
});

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

  // Build work items (problem + file + label)
  const work = problems.flatMap((p) => {
    const pf = files.find((f) => f.problemId === p.id);
    if (!pf) return [];
    const subName = (p.subjectId && subjectMap.get(p.subjectId)) || "";
    const lvlName = (p.levelId && levelMap.get(p.levelId)) || "";
    return [{ pf, label: `${subName}_${lvlName}_${p.code}`, pages: (pf.problemPages as number[]) ?? [] }];
  });

  // Download + extract with concurrency limit (avoid Drive API rate limits)
  const parts = await pMap(work, async (w) => {
    const raw = await downloadDriveFile(drive, w.pf.gdriveFileId);
    const buf = new Uint8Array(raw);
    if (w.pages.length === 0) {
      const types = await classifyPages(new Uint8Array(buf).buffer);
      const indices = problemPageIndices(types);
      if (indices.length === 0) return null;
      return extractAndLabel(buf, indices, w.label);
    }
    return extractAndLabel(buf, w.pages, w.label);
  }, 5);

  const pdfParts = parts.filter(Boolean) as Uint8Array[];

  if (pdfParts.length === 0) {
    return c.json({ error: "No problem pages found" }, 404);
  }

  const merged = await mergePdfs(pdfParts.map((p) => p.buffer as ArrayBuffer));
  const today = new Date().toISOString().slice(0, 10);

  return new Response(Buffer.from(merged), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="exported-${today}.pdf"`,
    },
  });
});

export default app;
