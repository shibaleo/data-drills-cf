import { Hono } from "hono";
import { db } from "@/lib/db";
import { problem, problemTag, problemFile } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomCode } from "@/lib/utils";

const app = new Hono();

app.get("/", async (c) => {
  const projectId = c.req.query("project_id");
  const rows = projectId
    ? await db.select().from(problem).where(eq(problem.projectId, projectId)).orderBy(problem.createdAt)
    : await db.select().from(problem).orderBy(problem.createdAt);
  return c.json({ data: rows, next_cursor: null });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const values = {
    code: (body.code || randomCode()) as string,
    projectId: body.project_id as string,
    subjectId: (body.subject_id ?? null) as string | null,
    levelId: (body.level_id ?? null) as string | null,
    topicId: (body.topic_id ?? null) as string | null,
    name: (body.name ?? null) as string | null,
    checkpoint: (body.checkpoint ?? null) as string | null,
    standardTime: (body.standard_time ?? null) as number | null,
    ...(body.id ? { id: body.id as string } : {}),
  };
  const [row] = await db.insert(problem).values(values).returning();
  return c.json({ data: row }, 201);
});

app.get("/:id", async (c) => {
  const [row] = await db.select().from(problem).where(eq(problem.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["code", "name", "checkpoint"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.subject_id !== undefined) updates.subjectId = body.subject_id;
  if (body.level_id !== undefined) updates.levelId = body.level_id;
  if (body.topic_id !== undefined) updates.topicId = body.topic_id;
  if (body.standard_time !== undefined) updates.standardTime = body.standard_time;
  const [row] = await db.update(problem).set(updates).where(eq(problem.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.delete("/:id", async (c) => {
  const [row] = await db.delete(problem).where(eq(problem.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

// ── Problem Tags ──

app.get("/:id/tags", async (c) => {
  const rows = await db.select().from(problemTag).where(eq(problemTag.problemId, c.req.param("id")));
  return c.json({ data: rows });
});

app.post("/:id/tags", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(problemTag).values({
    problemId: c.req.param("id"),
    tagId: body.tag_id,
  }).returning();
  return c.json({ data: row }, 201);
});

app.delete("/:id/tags/:tagId", async (c) => {
  await db.delete(problemTag).where(
    and(eq(problemTag.problemId, c.req.param("id")), eq(problemTag.tagId, c.req.param("tagId"))),
  );
  return c.json({ data: { ok: true } });
});

// ── Problem Files ──

app.get("/:id/files", async (c) => {
  const rows = await db.select().from(problemFile).where(eq(problemFile.problemId, c.req.param("id")));
  return c.json({ data: rows });
});

app.post("/:id/files", async (c) => {
  const body = await c.req.json();
  const values = {
    problemId: c.req.param("id"),
    gdriveFileId: body.gdrive_file_id as string,
    fileName: (body.file_name ?? null) as string | null,
    ...(body.id ? { id: body.id as string } : {}),
  };
  const [row] = await db.insert(problemFile).values(values).returning();
  return c.json({ data: row }, 201);
});

app.delete("/:id/files/:fileId", async (c) => {
  const [row] = await db.delete(problemFile).where(eq(problemFile.id, c.req.param("fileId"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

export default app;
