/**
 * /api/v1/statuses — GET + stability_days 専用 PUT。
 *
 * 2026-06-23〜 status master は FSRS の grade 仕様として framework 固定扱い。
 * UI からの create / delete / reorder / rename は撤去 (rename したい場合は SQL)。
 * stability_days のみ、about ページの FSRS チューニング UI から PUT で更新可能。
 * sortOrder 契約: sort_order = 0 は no-grade slot (= "New" placeholder)、
 * 1.. は graded (low → high)。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { answerStatus } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const statusTuneSchema = z.object({
  stability_days: z.number().int().nonnegative(),
});

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(answerStatus)
      .where(eq(answerStatus.userId, userId)).orderBy(answerStatus.sortOrder);
    return c.json({ data: rows, next_cursor: null });
  })
  .put("/:id", zValidator("json", statusTuneSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const [row] = await db.update(answerStatus)
      .set({ stabilityDays: body.stability_days, updatedAt: new Date() })
      .where(and(eq(answerStatus.id, c.req.param("id")), eq(answerStatus.userId, userId)))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
