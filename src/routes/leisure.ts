/**
 * Orgasm events (Neon DWH の Notion 由来データを透過 read-only proxy)。
 * 余暇タブ "不必要を削る" 分析用。behaviors (escape/fatigue 等) で分類。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neonSql } from "@/lib/neon-db";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const orgasmEventsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Row = {
  source_id: string;
  occurred_at: Date;
  occurred_date: string | Date;
  type: string | null;
  behaviors: string[] | null;
  n_behaviors: number | null;
  memo: string | null;
  hour_of_day: number | null;
  dow: number | null;
};

const app = new Hono<Env>()
  .get("/orgasm-events", zValidator("query", orgasmEventsQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const rows = await neonSql<Row[]>`
      SELECT source_id, occurred_at, occurred_date, type, behaviors,
             n_behaviors, memo, hour_of_day, dow
      FROM data_presentation.fct_orgasm_event
      WHERE occurred_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY occurred_at ASC
    `;
    return c.json({
      data: rows.map((r) => ({
        source_id: r.source_id,
        occurred_at: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
        occurred_date: r.occurred_date instanceof Date
          ? r.occurred_date.toISOString().slice(0, 10)
          : String(r.occurred_date).slice(0, 10),
        type: r.type,
        behaviors: r.behaviors ?? [],
        n_behaviors: r.n_behaviors,
        memo: r.memo,
        hour_of_day: r.hour_of_day,
        dow: r.dow,
      })),
    });
  });

export default app;
