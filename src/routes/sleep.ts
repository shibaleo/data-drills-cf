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

export const sleepSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD (JST)"),
});

type SummaryCurrentRow = {
  sleep_date: string | Date;
  start_at: Date | null;
  end_at: Date | null;
  minutes_asleep: string | number | null;
  minutes_awake: string | number | null;
  time_in_bed: string | number | null;
  efficiency: number | null;
  deep_minutes: string | number | null;
  light_minutes: string | number | null;
  rem_minutes: string | number | null;
  wake_minutes: string | number | null;
  hrv_ms: string | number | null;
  rhr_bpm: number | null;
  breath_bpm: string | number | null;
};

type SummaryHistRow = {
  sleep_date: string | Date;
  minutes_asleep: string | number | null;
  efficiency: number | null;
  hrv_ms: string | number | null;
  rhr_bpm: number | null;
};

function asNum(x: string | number | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

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
  })
  /**
   * GET /summary?date=YYYY-MM-DD
   *
   * 当該夜の睡眠サマリ (efficiency, stage 別分数, HRV, RHR, 呼吸数) と直近 7d
   * の HRV / 効率 trend を返す。digest sleep タブの 3 カード (STAGES /
   * EFFICIENCY / RECOVERY) で使う。
   */
  .get("/summary", zValidator("query", sleepSummaryQuerySchema), async (c) => {
    const { date } = c.req.valid("query");
    // 当日の詳細と直近 7d trend は互いに独立なので並列実行。
    const [curRows, histRows] = await Promise.all([
      neonSql<SummaryCurrentRow[]>`
        SELECT
          fhs.sleep_date,
          fhs.start_at, fhs.end_at,
          fhs.minutes_asleep, fhs.minutes_awake, fhs.time_in_bed,
          fhs.efficiency,
          fhs.deep_minutes, fhs.light_minutes, fhs.rem_minutes, fhs.wake_minutes,
          hrv.average_hrv_ms AS hrv_ms,
          rhr.resting_heart_rate AS rhr_bpm,
          (SELECT AVG(breaths_per_minute)
             FROM data_warehouse.stg_google_health__respiratory_rate_sleep_summary
             WHERE sample_time::date = fhs.sleep_date) AS breath_bpm
        FROM data_presentation.fct_health_sleep fhs
        LEFT JOIN data_warehouse.stg_google_health__daily_heart_rate_variability hrv
          ON hrv.date::date = fhs.sleep_date
        LEFT JOIN data_warehouse.stg_google_health__daily_resting_heart_rate rhr
          ON rhr.date::date = fhs.sleep_date
        WHERE fhs.sleep_date = ${date}::date AND fhs.sleep_type = 'STAGES'
        ORDER BY fhs.duration_seconds DESC NULLS LAST
        LIMIT 1
      `,
      neonSql<SummaryHistRow[]>`
        SELECT
          fhs.sleep_date,
          fhs.minutes_asleep,
          fhs.efficiency,
          hrv.average_hrv_ms AS hrv_ms,
          rhr.resting_heart_rate AS rhr_bpm
        FROM data_presentation.fct_health_sleep fhs
        LEFT JOIN data_warehouse.stg_google_health__daily_heart_rate_variability hrv
          ON hrv.date::date = fhs.sleep_date
        LEFT JOIN data_warehouse.stg_google_health__daily_resting_heart_rate rhr
          ON rhr.date::date = fhs.sleep_date
        WHERE fhs.sleep_date BETWEEN (${date}::date - 6) AND ${date}::date
          AND fhs.sleep_type = 'STAGES'
        ORDER BY fhs.sleep_date ASC
      `,
    ]);
    const cur = curRows[0] ?? null;
    return c.json({
      data: {
        current: cur ? {
          sleep_date: cur.sleep_date instanceof Date
            ? cur.sleep_date.toISOString().slice(0, 10)
            : String(cur.sleep_date).slice(0, 10),
          start_at: cur.start_at instanceof Date ? cur.start_at.toISOString() : null,
          end_at: cur.end_at instanceof Date ? cur.end_at.toISOString() : null,
          minutes_asleep: asNum(cur.minutes_asleep),
          minutes_awake: asNum(cur.minutes_awake),
          time_in_bed: asNum(cur.time_in_bed),
          efficiency: cur.efficiency == null ? null : Number(cur.efficiency),
          deep_minutes: asNum(cur.deep_minutes),
          light_minutes: asNum(cur.light_minutes),
          rem_minutes: asNum(cur.rem_minutes),
          wake_minutes: asNum(cur.wake_minutes),
          hrv_ms: asNum(cur.hrv_ms),
          rhr_bpm: cur.rhr_bpm == null ? null : Number(cur.rhr_bpm),
          breath_bpm: asNum(cur.breath_bpm),
        } : null,
        history: histRows.map((h) => ({
          sleep_date: h.sleep_date instanceof Date
            ? h.sleep_date.toISOString().slice(0, 10)
            : String(h.sleep_date).slice(0, 10),
          minutes_asleep: asNum(h.minutes_asleep),
          efficiency: h.efficiency == null ? null : Number(h.efficiency),
          hrv_ms: asNum(h.hrv_ms),
          rhr_bpm: h.rhr_bpm == null ? null : Number(h.rhr_bpm),
        })),
      },
    });
  });

export default app;
