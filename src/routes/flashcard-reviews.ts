import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { flashcardReview, flashcard, field } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ownsFlashcard } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({ flashcard_id: z.string().uuid().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const { flashcard_id: flashcardId } = c.req.valid("query");
    if (flashcardId) {
      if (!(await ownsFlashcard(flashcardId, userId))) return c.json({ data: [], next_cursor: null });
      const rows = await db.select().from(flashcardReview)
        .where(eq(flashcardReview.flashcardId, flashcardId)).orderBy(flashcardReview.reviewedAt);
      return c.json({ data: rows, next_cursor: null });
    }
    const rows = await db.select({ fr: flashcardReview }).from(flashcardReview)
      .innerJoin(flashcard, eq(flashcardReview.flashcardId, flashcard.id))
      .innerJoin(field, eq(flashcard.fieldId, field.id))
      .where(eq(field.userId, userId)).orderBy(flashcardReview.reviewedAt);
    return c.json({ data: rows.map((r) => r.fr), next_cursor: null });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    // ownership: traverse flashcardReview → flashcard → project
    const [check] = await db.select({ id: flashcardReview.id })
      .from(flashcardReview)
      .innerJoin(flashcard, eq(flashcardReview.flashcardId, flashcard.id))
      .innerJoin(field, eq(flashcard.fieldId, field.id))
      .where(and(eq(flashcardReview.id, c.req.param("id")), eq(field.userId, userId)))
      .limit(1);
    if (!check) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(flashcardReview).where(eq(flashcardReview.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
