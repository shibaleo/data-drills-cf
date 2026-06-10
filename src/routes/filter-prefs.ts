/**
 * filter_pref: one row per (user, scope), mutable UI filter settings (no history).
 * JSON bag keyed by feature, e.g. { "review": {...}, "plan": {...} }.
 *
 * Phase 7: 旧 field_id 単位 → scope_id 単位に変更。同 field 内の複数 scope を
 * 別々の UI prefs で扱えるようになった。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { filterPref, scope } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

/** scope の所有者 (user) と一致するか。bitemporal なので current revision を見る。 */
async function ownsScope(scopeId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: scope.id }).from(scope)
    .where(and(
      eq(scope.id, scopeId),
      eq(scope.userId, userId),
      isNull(scope.validTo),
      eq(scope.isActive, true),
    ))
    .limit(1);
  return !!row;
}

const upsertSchema = z.object({
  scope_id: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()),
});

const localScopeIdQuerySchema = z.object({
  scope_id: z.string().uuid(),
});

const app = new Hono<Env>()
  .get("/", zValidator("query", localScopeIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { scope_id: scopeId } = c.req.valid("query");
    if (!(await ownsScope(scopeId, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(filterPref)
      .where(and(eq(filterPref.userId, userId), eq(filterPref.scopeId, scopeId)));
    return c.json({ data: row ? { scope_id: row.scopeId, filters: row.filters, updated_at: (row.updatedAt as Date | string).toString() } : null });
  })
  .put("/", zValidator("json", upsertSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { scope_id: scopeId, filters } = c.req.valid("json");
    if (!(await ownsScope(scopeId, userId))) return c.json({ error: "Not found" }, 404);
    await db.execute(sql`
      INSERT INTO data_drills.filter_pref (user_id, scope_id, filters)
      VALUES (${userId}, ${scopeId}, ${JSON.stringify(filters)}::jsonb)
      ON CONFLICT (user_id, scope_id) DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()
    `);
    return c.json({ data: { scope_id: scopeId, filters } });
  });

export default app;
