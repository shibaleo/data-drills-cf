import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
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
    const rows = await db.select().from(project)
      .where(eq(project.userId, userId))
      .orderBy(project.sortOrder, project.createdAt);
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
    const [row] = await db.insert(project).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db.update(project).set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(project.id, id), eq(project.userId, userId))),
      ),
    );
    return c.json({ ok: true });
  })
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.select().from(project)
      .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)));
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
    const [row] = await db.update(project).set(updates)
      .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db.delete(project)
      .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .route("/:id/subjects", projectSubjects)
  .route("/:id/levels", projectLevels)
  .route("/:id/topics", projectTopics);

export default app;
