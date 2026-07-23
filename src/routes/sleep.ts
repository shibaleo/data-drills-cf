/**
 * Google Health sleep — proxied to the data-warehouse presentation API.
 * The warehouse now flattens sleep stages and computes the summary join
 * (HRV/RHR/breathing) server-side, returning byte-compatible envelopes.
 * Formerly direct Neon SQL with JS-side stage flattening.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { whGet } from "@/lib/warehouse-api";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const sleepStagesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (JST)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD (JST)"),
});

export const sleepSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD (JST)"),
});

type Stage = {
  session_id: string;
  sleep_date: string;
  stage_index: number;
  type: string;
  start_at: string;
  end_at: string;
};

type SummaryCurrent = {
  sleep_date: string;
  start_at: string | null;
  end_at: string | null;
  minutes_asleep: number | null;
  minutes_awake: number | null;
  time_in_bed: number | null;
  efficiency: number | null;
  deep_minutes: number | null;
  light_minutes: number | null;
  rem_minutes: number | null;
  wake_minutes: number | null;
  hrv_ms: number | null;
  rhr_bpm: number | null;
  breath_bpm: number | null;
};

type SummaryHistory = {
  sleep_date: string;
  minutes_asleep: number | null;
  efficiency: number | null;
  hrv_ms: number | null;
  rhr_bpm: number | null;
};

const app = new Hono<Env>()
  .get("/stages", zValidator("query", sleepStagesQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const body = await whGet<{ data: Stage[] }>("/sleep/stages", { from, to });
    return c.json(body);
  })
  .get("/summary", zValidator("query", sleepSummaryQuerySchema), async (c) => {
    const { date } = c.req.valid("query");
    const body = await whGet<{ data: { current: SummaryCurrent | null; history: SummaryHistory[] } }>(
      "/sleep/summary",
      { date },
    );
    return c.json(body);
  });

export default app;
