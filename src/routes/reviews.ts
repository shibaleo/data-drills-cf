import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { review, reviewTag } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  reviewCreateInputSchema,
  reviewUpdateInputSchema,
  reviewTagCreateInputSchema,
} from "@/lib/schemas/review";

const app = new Hono()
  .get("/", async (c) => {
    const answerId = c.req.query("answer_id");
    const rows = answerId
      ? await db.select().from(review).where(eq(review.answerId, answerId)).orderBy(review.createdAt)
      : await db.select().from(review).orderBy(review.createdAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", reviewCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      answerId: body.answer_id,
      content: body.content ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(review).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const [row] = await db.select().from(review).where(eq(review.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", reviewUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = {};
    if (body.content !== undefined) updates.content = body.content;
    const [row] = await db.update(review).set(updates).where(eq(review.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const [row] = await db.delete(review).where(eq(review.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Tags ──
  .get("/:id/tags", async (c) => {
    const rows = await db.select().from(reviewTag).where(eq(reviewTag.reviewId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/tags", zValidator("json", reviewTagCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const [row] = await db.insert(reviewTag).values({ reviewId: c.req.param("id"), tagId: body.tag_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/tags/:tagId", async (c) => {
    await db.delete(reviewTag).where(and(eq(reviewTag.reviewId, c.req.param("id")), eq(reviewTag.tagId, c.req.param("tagId"))));
    return c.json({ data: { ok: true } });
  });

export default app;
