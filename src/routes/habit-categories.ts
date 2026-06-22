/**
 * /api/v1/habit-categories — habit のグルーピング master CRUD。
 *
 * 他 master (field/subject/level/review_type) と同じ流儀。
 * 削除時、habit.category_id は ON DELETE SET NULL で離脱する。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { habitCategory } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  habitCategoryCreateInputSchema,
  habitCategoryUpdateInputSchema,
} from "@/lib/schemas/habit-category";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(habitCategory)
      .where(eq(habitCategory.userId, userId)).orderBy(habitCategory.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", habitCategoryCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const values = {
      userId,
      name: body.name,
      sortOrder: body.sort_order ?? 0,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(habitCategory).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(habitCategory).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(habitCategory.id, id), eq(habitCategory.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", habitCategoryUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db.update(habitCategory).set(updates)
      .where(and(eq(habitCategory.id, c.req.param("id")), eq(habitCategory.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(habitCategory)
      .where(and(eq(habitCategory.id, c.req.param("id")), eq(habitCategory.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
