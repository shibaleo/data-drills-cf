/**
 * Google Health sleep stages (Neon DWH 透過 read-only proxy)。
 *
 * stg_google_health__sleep.stages (jsonb) を行に flatten して返す。
 * 各 stage = { type: AWAKE|LIGHT|DEEP|REM|..., startTime, endTime } を持つので
 * 1 session × N stages 行を生成。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neonSql } from "@/lib/neon-db";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const sleepStagesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (JST)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD (JST)"),
});

type StageRow = {
  session_id: string | null;
  sleep_date: string | Date;
  sleep_type: string | null;
  stages: unknown;
};

type StageJson = {
  type?: string;
  startTime?: string;
  endTime?: string;
};

const app = new Hono<Env>()
  /**
   * GET /stages?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * JST 日付範囲で sleep session を絞り (sleep_date ベース)、各 session の
   * stages 配列を flatten して 1 stage = 1 entry で返す。
   */
  .get("/stages", zValidator("query", sleepStagesQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const rows = await neonSql<StageRow[]>`
      SELECT
        data_point_id AS session_id,
        sleep_date,
        sleep_type,
        stages
      FROM data_warehouse.stg_google_health__sleep
      WHERE sleep_date BETWEEN ${from}::date AND ${to}::date
        AND sleep_type = 'STAGES'
      ORDER BY start_time ASC
    `;
    const out: {
      session_id: string;
      sleep_date: string;
      stage_index: number;
      type: string;
      start_at: string;
      end_at: string;
    }[] = [];
    for (const r of rows) {
      const sessionId = r.session_id ?? "";
      const stages = Array.isArray(r.stages) ? (r.stages as StageJson[]) : [];
      const sleepDate = r.sleep_date instanceof Date
        ? r.sleep_date.toISOString().slice(0, 10)
        : String(r.sleep_date).slice(0, 10);
      stages.forEach((s, i) => {
        if (!s.type || !s.startTime || !s.endTime) return;
        out.push({
          session_id: sessionId,
          sleep_date: sleepDate,
          stage_index: i,
          type: s.type,
          start_at: s.startTime,
          end_at: s.endTime,
        });
      });
    }
    return c.json({ data: out });
  });

export default app;
