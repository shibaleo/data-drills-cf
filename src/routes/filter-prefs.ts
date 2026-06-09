/**
 * filter_pref: one row per (user, field), mutable UI filter settings (no history).
 * JSON bag keyed by scope, e.g. { "review": { subjectIds, levelIds, lastStatuses } }.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { filterPref } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ownsField } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const upsertSchema = z.object({
  field_id: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()),
});

const localFieldIdQuerySchema = z.object({
  field_id: z.string().uuid(),
});

const app = new Hono<Env>()
  .get("/", zValidator("query", localFieldIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { field_id: fieldId } = c.req.valid("query");
    if (!(await ownsField(fieldId, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(filterPref)
      .where(and(eq(filterPref.userId, userId), eq(filterPref.fieldId, fieldId)));
    return c.json({ data: row ? { field_id: row.fieldId, filters: row.filters, updated_at: (row.updatedAt as Date | string).toString() } : null });
  })
  .put("/", zValidator("json", upsertSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { field_id: fieldId, filters } = c.req.valid("json");
    if (!(await ownsField(fieldId, userId))) return c.json({ error: "Not found" }, 404);
    await db.execute(sql`
      INSERT INTO data_drills.filter_pref (user_id, field_id, filters)
      VALUES (${userId}, ${fieldId}, ${JSON.stringify(filters)}::jsonb)
      ON CONFLICT (user_id, field_id) DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()
    `);
    return c.json({ data: { field_id: fieldId, filters } });
  });

export default app;
