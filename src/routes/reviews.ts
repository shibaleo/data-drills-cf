import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { review, reviewTag, answer, problem, project } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  reviewCreateInputSchema,
  reviewUpdateInputSchema,
  reviewTagCreateInputSchema,
} from "@/lib/schemas/review";
import { z } from "zod";
import { ownsAnswer, ownsReview } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({ answer_id: z.string().uuid().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const { answer_id: answerId } = c.req.valid("query");
    if (answerId) {
      if (!(await ownsAnswer(answerId, userId))) return c.json({ data: [], next_cursor: null });
      const rows = await db.select().from(review)
        .where(eq(review.answerId, answerId)).orderBy(review.createdAt);
      return c.json({ data: rows, next_cursor: null });
    }
    const rows = await db.select({ r: review }).from(review)
      .innerJoin(answer, eq(review.answerId, answer.id))
      .innerJoin(problem, eq(answer.problemId, problem.id))
      .innerJoin(project, eq(problem.projectId, project.id))
      .where(eq(project.userId, userId)).orderBy(review.createdAt);
    return c.json({ data: rows.map((r) => r.r), next_cursor: null });
  })
  .post("/", zValidator("json", reviewCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsAnswer(body.answer_id, userId))) return c.json({ error: "Not found" }, 404);
    const values = {
      answerId: body.answer_id,
      content: body.content ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(review).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsReview(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(review).where(eq(review.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", reviewUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsReview(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = {};
    if (body.content !== undefined) updates.content = body.content;
    const [row] = await db.update(review).set(updates).where(eq(review.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsReview(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(review).where(eq(review.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Tags ──
  .get("/:id/tags", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsReview(c.req.param("id"), userId))) return c.json({ data: [] });
    const rows = await db.select().from(reviewTag).where(eq(reviewTag.reviewId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/tags", zValidator("json", reviewTagCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsReview(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const [row] = await db.insert(reviewTag).values({ reviewId: c.req.param("id"), tagId: body.tag_id }).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/tags/:tagId", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsReview(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    await db.delete(reviewTag).where(and(eq(reviewTag.reviewId, c.req.param("id")), eq(reviewTag.tagId, c.req.param("tagId"))));
    return c.json({ data: { ok: true } });
  });

export default app;
