import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { level } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { masterCreateInputSchema, masterUpdateInputSchema } from "@/lib/schemas/project";
import { reorderInputSchema } from "@/lib/schemas/common";
import { ownsProject } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const projectId = c.req.param("id")!;
    if (!(await ownsProject(projectId, userId))) return c.json({ data: [], next_cursor: null });
    const rows = await db.select().from(level).where(eq(level.projectId, projectId)).orderBy(level.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", masterCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const projectId = c.req.param("id")!;
    if (!(await ownsProject(projectId, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const values = {
      code: body.code || randomCode(),
      name: body.name,
      projectId,
      color: body.color ?? null,
      sortOrder: body.sort_order ?? 0,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(level).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const projectId = c.req.param("id")!;
    if (!(await ownsProject(projectId, userId))) return c.json({ ok: false }, 404);
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(level).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(level.id, id), eq(level.projectId, projectId))),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:entityId", zValidator("json", masterUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const projectId = c.req.param("id")!;
    if (!(await ownsProject(projectId, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db.update(level).set(updates)
      .where(and(eq(level.id, c.req.param("entityId")), eq(level.projectId, projectId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:entityId", async (c) => {
    const userId = c.get("authResult").userId;
    const projectId = c.req.param("id")!;
    if (!(await ownsProject(projectId, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(level)
      .where(and(eq(level.id, c.req.param("entityId")), eq(level.projectId, projectId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
