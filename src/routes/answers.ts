import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { answer, problem, project } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { toJSTDateString } from "@/lib/date-utils";
import {
  answerCreateInputSchema,
  answerUpdateInputSchema,
} from "@/lib/schemas/answer";
import { z } from "zod";
import { ownsProblem, ownsAnswer } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const toRow = (r: typeof answer.$inferSelect) => ({
  ...r,
  date: toJSTDateString(r.date),
  createdAt: r.createdAt.toISOString(),
});

const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({ problem_id: z.string().uuid().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const { problem_id: problemId } = c.req.valid("query");
    if (problemId) {
      if (!(await ownsProblem(problemId, userId))) return c.json({ data: [], next_cursor: null });
      const rows = await db.select().from(answer)
        .where(eq(answer.problemId, problemId)).orderBy(answer.date, answer.createdAt);
      return c.json({ data: rows.map(toRow), next_cursor: null });
    }
    const rows = await db.select({ a: answer }).from(answer)
      .innerJoin(problem, eq(answer.problemId, problem.id))
      .innerJoin(project, eq(problem.projectId, project.id))
      .where(eq(project.userId, userId)).orderBy(answer.date, answer.createdAt);
    return c.json({ data: rows.map((r) => toRow(r.a)), next_cursor: null });
  })
  .post("/", zValidator("json", answerCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsProblem(body.problem_id, userId))) return c.json({ error: "Not found" }, 404);
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
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsAnswer(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(answer).where(eq(answer.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  })
  .put("/:id", zValidator("json", answerUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsAnswer(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = {};
    if (body.date !== undefined) updates.date = new Date(body.date);
    if (body.duration !== undefined) updates.duration = body.duration;
    if (body.answer_status_id !== undefined) updates.answerStatusId = body.answer_status_id;
    const [row] = await db.update(answer).set(updates).where(eq(answer.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsAnswer(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(answer).where(eq(answer.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: toRow(row) });
  });

export default app;
