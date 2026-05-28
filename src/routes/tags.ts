import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { tagCreateInputSchema, tagUpdateInputSchema } from "@/lib/schemas/tag";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(tag)
      .where(eq(tag.userId, userId)).orderBy(tag.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", tagCreateInputSchema), async (c) => {
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
    const [row] = await db.insert(tag).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(tag).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(tag.id, id), eq(tag.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", tagUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db.update(tag).set(updates)
      .where(and(eq(tag.id, c.req.param("id")), eq(tag.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(tag)
      .where(and(eq(tag.id, c.req.param("id")), eq(tag.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
