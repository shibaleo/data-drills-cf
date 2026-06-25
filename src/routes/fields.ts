/**
 * /api/v1/fields — 旧 /api/v1/projects の後継。Phase 2 で並走、Phase 4 で旧を削除。
 *
 * `field` は学問領域カテゴリ (user 所有、永続)。subject/level/problem/flashcard の親。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { field } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { fieldCreateInputSchema, fieldUpdateInputSchema } from "@/lib/schemas/field";
import { reorderInputSchema } from "@/lib/schemas/common";
import fieldSubjects from "@/routes/field-subjects";
import fieldLevels from "@/routes/field-levels";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(field)
      .where(eq(field.userId, userId))
      .orderBy(field.sortOrder, field.createdAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", fieldCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const values = {
      userId,
      code: body.code || randomCode(),
      name: body.name,
      color: body.color ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(field).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(field).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(field.id, id), eq(field.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.select().from(field)
      .where(and(eq(field.id, c.req.param("id")), eq(field.userId, userId)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", fieldUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    if (body.is_archived !== undefined) updates.isArchived = body.is_archived;
    const [row] = await db.update(field).set(updates)
      .where(and(eq(field.id, c.req.param("id")), eq(field.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(field)
      .where(and(eq(field.id, c.req.param("id")), eq(field.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .route("/:id/subjects", fieldSubjects)
  .route("/:id/levels", fieldLevels);

export default app;
