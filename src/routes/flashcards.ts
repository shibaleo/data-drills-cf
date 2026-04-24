import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { flashcard, flashcardTag, flashcardProblem, flashcardReview } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  flashcardCreateInputSchema,
  flashcardUpdateInputSchema,
  flashcardTagCreateInputSchema,
  flashcardProblemCreateInputSchema,
  flashcardReviewCreateInputSchema,
} from "@/lib/schemas/flashcard";

const app = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("project_id");
    const rows = projectId
      ? await db.select().from(flashcard).where(eq(flashcard.projectId, projectId)).orderBy(flashcard.createdAt)
      : await db.select().from(flashcard).orderBy(flashcard.createdAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", flashcardCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      code: body.code || randomCode(),
      projectId: body.project_id,
      topicId: body.topic_id ?? null,
      front: body.front,
      back: body.back,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(flashcard).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const [row] = await db.select().from(flashcard).where(eq(flashcard.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", flashcardUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.front !== undefined) updates.front = body.front;
    if (body.back !== undefined) updates.back = body.back;
    if (body.topic_id !== undefined) updates.topicId = body.topic_id;
    const [row] = await db.update(flashcard).set(updates).where(eq(flashcard.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const [row] = await db.delete(flashcard).where(eq(flashcard.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Tags ──
  .get("/:id/tags", async (c) => {
    const rows = await db.select().from(flashcardTag).where(eq(flashcardTag.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/tags", zValidator("json", flashcardTagCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db.insert(flashcardTag).values({ flashcardId: c.req.param("id"), tagId: body.tag_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/tags/:tagId", async (c) => {
    await db.delete(flashcardTag).where(and(eq(flashcardTag.flashcardId, c.req.param("id")), eq(flashcardTag.tagId, c.req.param("tagId"))));
    return c.json({ data: { ok: true } });
  })
  // ── Problems ──
  .get("/:id/problems", async (c) => {
    const rows = await db.select().from(flashcardProblem).where(eq(flashcardProblem.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/problems", zValidator("json", flashcardProblemCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db.insert(flashcardProblem).values({ flashcardId: c.req.param("id"), problemId: body.problem_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/problems/:problemId", async (c) => {
    await db.delete(flashcardProblem).where(and(eq(flashcardProblem.flashcardId, c.req.param("id")), eq(flashcardProblem.problemId, c.req.param("problemId"))));
    return c.json({ data: { ok: true } });
  })
  // ── Reviews ──
  .get("/:id/reviews", async (c) => {
    const rows = await db.select().from(flashcardReview).where(eq(flashcardReview.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/reviews", zValidator("json", flashcardReviewCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const reviewValues = {
      flashcardId: c.req.param("id"),
      quality: body.quality,
      reviewedAt: new Date(body.reviewed_at || new Date().toISOString()),
      nextReviewAt: body.next_review_at ? new Date(body.next_review_at) : null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(flashcardReview).values(reviewValues).returning();
    return c.json({ data: row }, 201);
  });

export default app;
