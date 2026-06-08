/**
 * Phase 4: project table 廃止後の透過プロキシ。
 *
 * 中身は field を直接 CRUD する (field.id === 旧 project.id で backfill 済)。
 * 既存の hooks/外部 client (taxtant) が `/api/v1/projects/:id/subjects` 等を
 * 叩いているため、sub-route mount を維持する。B フェーズで完全削除予定。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { field } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  projectCreateInputSchema,
  projectUpdateInputSchema,
} from "@/lib/schemas/project";
import { reorderInputSchema } from "@/lib/schemas/common";
import projectSubjects from "@/routes/project-subjects";
import projectLevels from "@/routes/project-levels";
import projectTopics from "@/routes/project-topics";
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
  .post("/", zValidator("json", projectCreateInputSchema), async (c) => {
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
  .put("/:id", zValidator("json", projectUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
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
  .route("/:id/subjects", projectSubjects)
  .route("/:id/levels", projectLevels)
  .route("/:id/topics", projectTopics);

export default app;
