import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { answer } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { toJSTDateString } from "@/lib/date-utils";
import {
  answerCreateInputSchema,
  answerUpdateInputSchema,
} from "@/lib/schemas/answer";

const toRow = (r: typeof answer.$inferSelect) => ({
  ...r,
  date: toJSTDateString(r.date),
  createdAt: r.createdAt.toISOString(),
});

const app = new Hono()
  .get("/", async (c) => {
    const problemId = c.req.query("problem_id");
    const rows = problemId
      ? await db.select().from(answer).where(eq(answer.problemId, problemId)).orderBy(answer.date, answer.createdAt)
      : await db.select().from(answer).orderBy(answer.date, answer.createdAt);
    return c.json({ data: rows.map(toRow), next_cursor: null });
  })
  .post("/", zValidator("json", answerCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      problemId: body.problem_id,
      date: new Date(body.date),
      duration: body.duration ?? null,
      answerStatusId: body.answer_status_id ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(answer).values(values).returning();
    return c.json({ data: toRow(row) }, 201);
  })
  .get("/:id", async (c) => {
    const [row] = await db.select().from(answer).where(eq(answer.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  })
  .put("/:id", zValidator("json", answerUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = {};
    if (body.date !== undefined) updates.date = new Date(body.date);
    if (body.duration !== undefined) updates.duration = body.duration;
    if (body.answer_status_id !== undefined) updates.answerStatusId = body.answer_status_id;
    const [row] = await db.update(answer).set(updates).where(eq(answer.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  })
  .delete("/:id", async (c) => {
    const [row] = await db.delete(answer).where(eq(answer.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  });

export default app;
