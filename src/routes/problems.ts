import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { problem, problemTag, problemFile } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  problemCreateInputSchema,
  problemUpdateInputSchema,
  problemTagCreateInputSchema,
  problemFileCreateInputSchema,
} from "@/lib/schemas/problem";

const app = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("project_id");
    const rows = projectId
      ? await db.select().from(problem).where(eq(problem.projectId, projectId)).orderBy(problem.createdAt)
      : await db.select().from(problem).orderBy(problem.createdAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", problemCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      code: body.code || randomCode(),
      projectId: body.project_id,
      subjectId: body.subject_id ?? null,
      levelId: body.level_id ?? null,
      topicId: body.topic_id ?? null,
      name: body.name ?? null,
      checkpoint: body.checkpoint ?? null,
      standardTime: body.standard_time ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(problem).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const [row] = await db.select().from(problem).where(eq(problem.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", problemUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.checkpoint !== undefined) updates.checkpoint = body.checkpoint;
    if (body.subject_id !== undefined) updates.subjectId = body.subject_id;
    if (body.level_id !== undefined) updates.levelId = body.level_id;
    if (body.topic_id !== undefined) updates.topicId = body.topic_id;
    if (body.standard_time !== undefined) updates.standardTime = body.standard_time;
    const [row] = await db.update(problem).set(updates).where(eq(problem.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const [row] = await db.delete(problem).where(eq(problem.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Problem Tags ──
  .get("/:id/tags", async (c) => {
    const rows = await db.select().from(problemTag).where(eq(problemTag.problemId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/tags", zValidator("json", problemTagCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db.insert(problemTag).values({
      problemId: c.req.param("id"),
      tagId: body.tag_id,
    }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/tags/:tagId", async (c) => {
    await db.delete(problemTag).where(
      and(eq(problemTag.problemId, c.req.param("id")), eq(problemTag.tagId, c.req.param("tagId"))),
    );
    return c.json({ data: { ok: true } });
  })
  // ── Problem Files ──
  .get("/:id/files", async (c) => {
    const rows = await db.select().from(problemFile).where(eq(problemFile.problemId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/files", zValidator("json", problemFileCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      problemId: c.req.param("id"),
      gdriveFileId: body.gdrive_file_id,
      fileName: body.file_name ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(problemFile).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/files/:fileId", async (c) => {
    const [row] = await db.delete(problemFile).where(eq(problemFile.id, c.req.param("fileId"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
