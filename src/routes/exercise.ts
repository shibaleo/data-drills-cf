/**
 * Strength sessions — proxied to the data-warehouse presentation API
 * (fct_strength_session). Formerly direct Neon SQL.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { whGet } from "@/lib/warehouse-api";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const exerciseSessionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Session = {
  source_id: string;
  recorded_date: string;
  subject: string | null;
  weight_kg: number | null;
  reps: number | null;
  volume_kg_reps: number | null;
  notion_created_at: string | null;
};

const app = new Hono<Env>()
  .get("/sessions", zValidator("query", exerciseSessionsQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const body = await whGet<{ data: Session[] }>("/exercise/sessions", { from, to });
    return c.json(body);
  });

export default app;
