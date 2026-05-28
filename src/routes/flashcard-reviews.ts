import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { flashcardReview } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono()
  .get("/", zValidator("query", z.object({ flashcard_id: z.string().uuid().optional() })), async (c) => {
    const { flashcard_id: flashcardId } = c.req.valid("query");
    const rows = flashcardId
      ? await db.select().from(flashcardReview).where(eq(flashcardReview.flashcardId, flashcardId)).orderBy(flashcardReview.reviewedAt)
      : await db.select().from(flashcardReview).orderBy(flashcardReview.reviewedAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .delete("/:id", async (c) => {
    const [row] = await db.delete(flashcardReview).where(eq(flashcardReview.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
