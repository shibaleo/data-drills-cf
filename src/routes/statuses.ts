import { Hono } from "hono";
import { db } from "@/lib/db";
import { answerStatus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";

const app = new Hono();

app.get("/", async (c) => {
  const rows = await db.select().from(answerStatus).orderBy(answerStatus.sortOrder);
  return c.json({ data: rows, next_cursor: null });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const values = {
    code: (body.code || randomCode()) as string,
    name: body.name as string,
    color: (body.color ?? null) as string | null,
    point: (body.point ?? 0) as number,
    sortOrder: (body.sort_order ?? 0) as number,
    stabilityDays: (body.stability_days ?? 0) as number,
    description: (body.description ?? null) as string | null,
    ...(body.id ? { id: body.id as string } : {}),
  };
  const [row] = await db.insert(answerStatus).values(values).returning();
  return c.json({ data: row }, 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.code !== undefined) updates.code = body.code;
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.point !== undefined) updates.point = body.point;
  if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
  if (body.stability_days !== undefined) updates.stabilityDays = body.stability_days;
  if (body.description !== undefined) updates.description = body.description;
  const [row] = await db.update(answerStatus).set(updates).where(eq(answerStatus.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.patch("/reorder", async (c) => {
  const body = await c.req.json();
  const ids = body.ids as string[];
  if (!Array.isArray(ids)) return c.json({ error: "ids must be an array" }, 400);
  await Promise.all(
    ids.map((id, i) =>
      db.update(answerStatus).set({ sortOrder: i, updatedAt: new Date() }).where(eq(answerStatus.id, id)),
    ),
  );
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const [row] = await db.delete(answerStatus).where(eq(answerStatus.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

export default app;
