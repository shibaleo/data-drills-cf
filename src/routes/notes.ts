import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { note, noteTag, noteProblem } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  noteCreateInputSchema,
  noteUpdateInputSchema,
  noteTagCreateInputSchema,
  noteProblemCreateInputSchema,
} from "@/lib/schemas/note";
import { reorderInputSchema } from "@/lib/schemas/common";

const app = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("project_id");
    const rows = projectId
      ? await db
          .select()
          .from(note)
          .where(eq(note.projectId, projectId))
          .orderBy(desc(note.pinned), note.sortOrder, desc(note.updatedAt))
      : await db.select().from(note).orderBy(desc(note.updatedAt));
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", noteCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      projectId: body.project_id,
      topicId: body.topic_id ?? null,
      title: body.title,
      content: body.content ?? "",
      pinned: body.pinned ?? false,
      sortOrder: body.sort_order ?? 0,
    };
    const [row] = await db.insert(note).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(note).set({ sortOrder: i, updatedAt: new Date() }).where(eq(note.id, id)),
      ),
    );
    return c.json({ ok: true });
  })
  .get("/:id", async (c) => {
    const [row] = await db
      .select()
      .from(note)
      .where(eq(note.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", noteUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.topic_id !== undefined) updates.topicId = body.topic_id;
    if (body.pinned !== undefined) updates.pinned = body.pinned;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db
      .update(note)
      .set(updates)
      .where(eq(note.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const [row] = await db
      .delete(note)
      .where(eq(note.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Tags ──
  .get("/:id/tags", async (c) => {
    const rows = await db
      .select()
      .from(noteTag)
      .where(eq(noteTag.noteId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/tags", zValidator("json", noteTagCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db
      .insert(noteTag)
      .values({ noteId: c.req.param("id"), tagId: body.tag_id })
      .returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/tags/:tagId", async (c) => {
    await db
      .delete(noteTag)
      .where(
        and(
          eq(noteTag.noteId, c.req.param("id")),
          eq(noteTag.tagId, c.req.param("tagId")),
        ),
      );
    return c.json({ data: { ok: true } });
  })
  // ── Problems ──
  .get("/:id/problems", async (c) => {
    const rows = await db
      .select()
      .from(noteProblem)
      .where(eq(noteProblem.noteId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/problems", zValidator("json", noteProblemCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db
      .insert(noteProblem)
      .values({ noteId: c.req.param("id"), problemId: body.problem_id })
      .returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/problems/:problemId", async (c) => {
    await db
      .delete(noteProblem)
      .where(
        and(
          eq(noteProblem.noteId, c.req.param("id")),
          eq(noteProblem.problemId, c.req.param("problemId")),
        ),
      );
    return c.json({ data: { ok: true } });
  });

export default app;
