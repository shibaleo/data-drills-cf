/**
 * filter_pref: one row per (user, project), mutable UI filter settings (no history).
 * JSON bag keyed by scope, e.g. { "review": { subjectIds, levelIds, lastStatuses } }.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { filterPref } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import { ownsProject } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const upsertSchema = z.object({
  project_id: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()),
});

const app = new Hono<Env>()
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId } = c.req.valid("query");
    if (!(await ownsProject(projectId, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(filterPref)
      .where(and(eq(filterPref.userId, userId), eq(filterPref.projectId, projectId)));
    return c.json({ data: row ? { project_id: row.projectId, filters: row.filters, updated_at: (row.updatedAt as Date | string).toString() } : null });
  })
  .put("/", zValidator("json", upsertSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId, filters } = c.req.valid("json");
    if (!(await ownsProject(projectId, userId))) return c.json({ error: "Not found" }, 404);
    await db.execute(sql`
      INSERT INTO data_drills.filter_pref (user_id, project_id, filters)
      VALUES (${userId}, ${projectId}, ${JSON.stringify(filters)}::jsonb)
      ON CONFLICT (user_id, project_id) DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()
    `);
    return c.json({ data: { project_id: projectId, filters } });
  });

export default app;
