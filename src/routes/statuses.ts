import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { answerStatus } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { statusCreateInputSchema, statusUpdateInputSchema } from "@/lib/schemas/status";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(answerStatus)
      .where(eq(answerStatus.userId, userId)).orderBy(answerStatus.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", statusCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const values = {
      userId,
      code: body.code || randomCode(),
      name: body.name,
      color: body.color ?? null,
      point: body.point ?? 0,
      sortOrder: body.sort_order ?? 0,
      stabilityDays: body.stability_days ?? 0,
      description: body.description ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(answerStatus).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(answerStatus).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(answerStatus.id, id), eq(answerStatus.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", statusUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.point !== undefined) updates.point = body.point;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    if (body.stability_days !== undefined) updates.stabilityDays = body.stability_days;
    if (body.description !== undefined) updates.description = body.description;
    const [row] = await db.update(answerStatus).set(updates)
      .where(and(eq(answerStatus.id, c.req.param("id")), eq(answerStatus.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(answerStatus)
      .where(and(eq(answerStatus.id, c.req.param("id")), eq(answerStatus.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
