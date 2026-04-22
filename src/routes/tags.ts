import { Hono } from "hono";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";

const app = new Hono();

app.get("/", async (c) => {
  const rows = await db.select().from(tag).orderBy(tag.sortOrder);
  return c.json({ data: rows, next_cursor: null });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const values = {
    code: (body.code || randomCode()) as string,
    name: body.name as string,
    color: (body.color ?? null) as string | null,
    sortOrder: (body.sort_order ?? 0) as number,
    ...(body.id ? { id: body.id as string } : {}),
  };
  const [row] = await db.insert(tag).values(values).returning();
  return c.json({ data: row }, 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.code !== undefined) updates.code = body.code;
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
  const [row] = await db.update(tag).set(updates).where(eq(tag.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

app.patch("/reorder", async (c) => {
  const body = await c.req.json();
  const ids = body.ids as string[];
  if (!Array.isArray(ids)) return c.json({ error: "ids must be an array" }, 400);
  await Promise.all(
    ids.map((id, i) =>
      db.update(tag).set({ sortOrder: i, updatedAt: new Date() }).where(eq(tag.id, id)),
    ),
  );
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const [row] = await db.delete(tag).where(eq(tag.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

export default app;
