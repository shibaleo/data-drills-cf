/**
 * filter_pref: one row per project, mutable UI filter settings (no history).
 * JSON bag keyed by scope, e.g. { "review": { subjectIds, levelIds, statuses } }.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { filterPref } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { projectIdQuerySchema } from "@/lib/schemas/common";

const upsertSchema = z.object({
  project_id: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()),
});

const app = new Hono()
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const [row] = await db.select().from(filterPref).where(eq(filterPref.projectId, projectId));
    return c.json({ data: row ? { project_id: row.projectId, filters: row.filters, updated_at: (row.updatedAt as Date | string).toString() } : null });
  })
  .put("/", zValidator("json", upsertSchema), async (c) => {
    const { project_id: projectId, filters } = c.req.valid("json");
    await db.execute(sql`
      INSERT INTO filter_pref (project_id, filters)
      VALUES (${projectId}, ${JSON.stringify(filters)}::jsonb)
      ON CONFLICT (project_id) DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()
    `);
    return c.json({ data: { project_id: projectId, filters } });
  });

export default app;
