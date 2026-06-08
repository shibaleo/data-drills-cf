/**
 * /api/v1/review-types — 旧 /api/v1/tags の後継。Phase 2 で並走、Phase 4 で旧を削除。
 *
 * `review_type` は review 評価種別 (不理解/理解 etc) のマスター。user 所有。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { reviewType } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { reviewTypeCreateInputSchema, reviewTypeUpdateInputSchema } from "@/lib/schemas/review-type";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(reviewType)
      .where(eq(reviewType.userId, userId)).orderBy(reviewType.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", reviewTypeCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const values = {
      userId,
      code: body.code || randomCode(),
      name: body.name,
      color: body.color ?? null,
      sortOrder: body.sort_order ?? 0,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(reviewType).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(reviewType).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(reviewType.id, id), eq(reviewType.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", reviewTypeUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db.update(reviewType).set(updates)
      .where(and(eq(reviewType.id, c.req.param("id")), eq(reviewType.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(reviewType)
      .where(and(eq(reviewType.id, c.req.param("id")), eq(reviewType.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
