/**
 * /api/v1/habits — recurrent habits CRUD。
 *
 * Grouped form (2026-06-22): habit は (name, toggl_project, toggl_description_patterns[])
 * + cadence + sort_order + is_active を持つ。表示色や所要時間は warehouse の
 * fct_toggl_time_entries から都度 lookup する。マッチ判定 (entry → habit) は
 * habit-fresh ルートで OR-of-regex を適用する。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { habit } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { habitCreateInputSchema, habitUpdateInputSchema } from "@/lib/schemas/habit";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(habit)
      .where(eq(habit.userId, userId)).orderBy(habit.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", habitCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const values = {
      userId,
      name: body.name,
      cadence: body.cadence,
      togglDescriptionPatterns: body.toggl_description_patterns,
      sortOrder: body.sort_order ?? 0,
      isActive: body.is_active ?? true,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(habit).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(habit).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(habit.id, id), eq(habit.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", habitUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.cadence !== undefined) updates.cadence = body.cadence;
    if (body.toggl_description_patterns !== undefined) {
      updates.togglDescriptionPatterns = body.toggl_description_patterns;
    }
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    const [row] = await db.update(habit).set(updates)
      .where(and(eq(habit.id, c.req.param("id")), eq(habit.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(habit)
      .where(and(eq(habit.id, c.req.param("id")), eq(habit.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
