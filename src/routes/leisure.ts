/**
 * Orgasm events — proxied to the data-warehouse presentation API
 * (fct_orgasm_event). 余暇タブ "不必要を削る" 分析用。behaviors で分類。
 * Formerly direct Neon SQL.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { whGet } from "@/lib/warehouse-api";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const orgasmEventsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type OrgasmEvent = {
  source_id: string;
  occurred_at: string;
  occurred_date: string;
  type: string | null;
  behaviors: string[];
  n_behaviors: number | null;
  memo: string | null;
  hour_of_day: number | null;
  dow: number | null;
};

const app = new Hono<Env>()
  .get("/orgasm-events", zValidator("query", orgasmEventsQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const body = await whGet<{ data: OrgasmEvent[] }>("/leisure/orgasm-events", { from, to });
    return c.json(body);
  });

export default app;
