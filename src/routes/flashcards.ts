import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { flashcard, flashcardTag, flashcardProblem, flashcardReview, field } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  flashcardCreateInputSchema,
  flashcardUpdateInputSchema,
  flashcardTagCreateInputSchema,
  flashcardProblemCreateInputSchema,
  flashcardReviewCreateInputSchema,
} from "@/lib/schemas/flashcard";
import { z } from "zod";
import { ownsField, ownsFlashcard } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({ field_id: z.string().uuid().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const { field_id: fieldId } = c.req.valid("query");
    if (fieldId) {
      if (!(await ownsField(fieldId, userId))) return c.json({ data: [], next_cursor: null });
      const rows = await db.select().from(flashcard)
        .where(eq(flashcard.fieldId, fieldId)).orderBy(flashcard.createdAt);
      return c.json({ data: rows, next_cursor: null });
    }
    const rows = await db.select({ f: flashcard }).from(flashcard)
      .innerJoin(field, eq(flashcard.fieldId, field.id))
      .where(eq(field.userId, userId)).orderBy(flashcard.createdAt);
    return c.json({ data: rows.map((r) => r.f), next_cursor: null });
  })
  .post("/", zValidator("json", flashcardCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsField(body.field_id, userId))) return c.json({ error: "Not found" }, 404);
    const values = {
      code: body.code || randomCode(),
      fieldId: body.field_id,
      front: body.front,
      back: body.back,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(flashcard).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsFlashcard(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(flashcard).where(eq(flashcard.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", flashcardUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsFlashcard(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.front !== undefined) updates.front = body.front;
    if (body.back !== undefined) updates.back = body.back;
    const [row] = await db.update(flashcard).set(updates).where(eq(flashcard.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsFlashcard(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(flashcard).where(eq(flashcard.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Review types ──
  .get("/:id/review-types", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ data: [] });
    const rows = await db.select().from(flashcardTag).where(eq(flashcardTag.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/review-types", zValidator("json", flashcardTagCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const [row] = await db.insert(flashcardTag).values({ flashcardId: c.req.param("id"), reviewTypeId: body.review_type_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/review-types/:reviewTypeId", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    await db.delete(flashcardTag).where(and(eq(flashcardTag.flashcardId, c.req.param("id")), eq(flashcardTag.reviewTypeId, c.req.param("reviewTypeId"))));
    return c.json({ data: { ok: true } });
  })
  // ── Problems ──
  .get("/:id/problems", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ data: [] });
    const rows = await db.select().from(flashcardProblem).where(eq(flashcardProblem.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/problems", zValidator("json", flashcardProblemCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const [row] = await db.insert(flashcardProblem).values({ flashcardId: c.req.param("id"), problemId: body.problem_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/problems/:problemId", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    await db.delete(flashcardProblem).where(and(eq(flashcardProblem.flashcardId, c.req.param("id")), eq(flashcardProblem.problemId, c.req.param("problemId"))));
    return c.json({ data: { ok: true } });
  })
  // ── Reviews ──
  .get("/:id/reviews", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ data: [] });
    const rows = await db.select().from(flashcardReview).where(eq(flashcardReview.flashcardId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/reviews", zValidator("json", flashcardReviewCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsFlashcard(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
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
