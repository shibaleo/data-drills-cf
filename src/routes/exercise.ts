/**
 * Strength sessions (Neon DWH の Notion 由来データを透過 read-only proxy)。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neonSql } from "@/lib/neon-db";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const exerciseSessionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Row = {
  source_id: string;
  recorded_date: string | Date;
  subject: string | null;
  weight_kg: string | number | null;
  reps: number | null;
  volume_kg_reps: string | number | null;
};

const app = new Hono<Env>()
  .get("/sessions", zValidator("query", exerciseSessionsQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const rows = await neonSql<Row[]>`
      SELECT source_id, recorded_date, subject, weight_kg, reps, volume_kg_reps
      FROM data_presentation.fct_strength_session
      WHERE recorded_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY recorded_date ASC, subject ASC
    `;
    return c.json({
      data: rows.map((r) => ({
        source_id: r.source_id,
        recorded_date: r.recorded_date instanceof Date
          ? r.recorded_date.toISOString().slice(0, 10)
          : String(r.recorded_date).slice(0, 10),
        subject: r.subject,
        weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
        reps: r.reps,
        volume_kg_reps: r.volume_kg_reps == null ? null : Number(r.volume_kg_reps),
      })),
    });
  });

export default app;
