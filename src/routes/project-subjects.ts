import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { subject } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import { masterCreateInputSchema, masterUpdateInputSchema } from "@/lib/schemas/project";
import { reorderInputSchema } from "@/lib/schemas/common";

const app = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.param("id")!;
    const rows = await db.select().from(subject).where(eq(subject.projectId, projectId)).orderBy(subject.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", masterCreateInputSchema), async (c) => {
    const projectId = c.req.param("id")!;
    const body = c.req.valid("json");
    const values = {
      code: body.code || randomCode(),
      name: body.name,
      projectId,
      color: body.color ?? null,
      sortOrder: body.sort_order ?? 0,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(subject).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(subject).set({ sortOrder: i, updatedAt: new Date() }).where(eq(subject.id, id)),
      ),
    );
    return c.json({ ok: true });
  })
  .put("/:entityId", zValidator("json", masterUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db.update(subject).set(updates).where(eq(subject.id, c.req.param("entityId"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:entityId", async (c) => {
    const [row] = await db.delete(subject).where(eq(subject.id, c.req.param("entityId"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
