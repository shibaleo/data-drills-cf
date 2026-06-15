/**
 * /api/v1/habits — recurrent habits CRUD。
 *
 * habit テーブルは「定義 + Toggl マッチルール」のみを持つ。done セルは別 table
 * に materialize せず、warehouse の data_presentation.fct_toggl_time_entries を
 * Worker 側で JOIN して構成する。
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
      togglProject: body.toggl_project,
      togglDescription: body.toggl_description,
      categoryColor: body.category_color,
      minutesEstimate: body.minutes_estimate ?? 5,
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
    if (body.toggl_project !== undefined) updates.togglProject = body.toggl_project;
    if (body.toggl_description !== undefined) updates.togglDescription = body.toggl_description;
    if (body.category_color !== undefined) updates.categoryColor = body.category_color;
    if (body.minutes_estimate !== undefined) updates.minutesEstimate = body.minutes_estimate;
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
