import { Hono } from "hono";
import { db } from "@/lib/db";
import { review, reviewTag } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
  const answerId = c.req.query("answer_id");
  const rows = answerId
    ? await db.select().from(review).where(eq(review.answerId, answerId)).orderBy(review.createdAt)
    : await db.select().from(review).orderBy(review.createdAt);
  return c.json({ data: rows, next_cursor: null });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const values = {
    answerId: body.answer_id as string,
    content: (body.content ?? null) as string | null,
    ...(body.id ? { id: body.id as string } : {}),
  };
  const [row] = await db.insert(review).values(values).returning();
  return c.json({ data: row }, 201);
});

app.get("/:id", async (c) => {
  const [row] = await db.select().from(review).where(eq(review.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  if (body.content !== undefined) updates.content = body.content;
  const [row] = await db.update(review).set(updates).where(eq(review.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.delete("/:id", async (c) => {
  const [row] = await db.delete(review).where(eq(review.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

// ── Tags ──
app.get("/:id/tags", async (c) => {
  const rows = await db.select().from(reviewTag).where(eq(reviewTag.reviewId, c.req.param("id")));
  return c.json({ data: rows });
});

app.post("/:id/tags", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(reviewTag).values({ reviewId: c.req.param("id"), tagId: body.tag_id }).returning();
  return c.json({ data: row }, 201);
});

app.delete("/:id/tags/:tagId", async (c) => {
  await db.delete(reviewTag).where(and(eq(reviewTag.reviewId, c.req.param("id")), eq(reviewTag.tagId, c.req.param("tagId"))));
  return c.json({ data: { ok: true } });
});

export default app;
