/**
 * Toggl reads — proxied to the data-warehouse presentation API (Cloudflare
 * Worker + D1). Formerly direct Neon SQL (`@/lib/neon-db`); the warehouse now
 * owns the SQL + shaping and returns byte-compatible envelopes, so these routes
 * are thin authenticated pass-throughs. Response types are preserved so the
 * hc<AppType> RPC client keeps inferring TogglEntry / TogglCategory.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { whGet } from "@/lib/warehouse-api";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const togglTimeEntriesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (JST)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD (JST)"),
  category: z.string().optional(),
});

type TimeEntry = {
  id: string;
  source_id: string | null;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
  client_name: string | null;
  tag_names: string[];
  personal_category: string | null;
  coarse_personal_category: string | null;
  social_category: string | null;
};

type Category = {
  name: string;
  name_ja: string | null;
  description: string | null;
  coarse_category: string | null;
  sort_order: number | null;
};

type HabitCandidate = {
  project_name: string | null;
  description: string | null;
  project_color: string | null;
  n: number;
  last_seen: string | null;
};

const app = new Hono<Env>()
  .get("/habit-candidates", async (c) => {
    const body = await whGet<{ data: HabitCandidate[] }>("/toggl/habit-candidates");
    return c.json(body);
  })
  .get("/categories", async (c) => {
    const body = await whGet<{ data: Category[] }>("/toggl/categories");
    return c.json(body);
  })
  .get("/time-entries", zValidator("query", togglTimeEntriesQuerySchema), async (c) => {
    const { from, to, category } = c.req.valid("query");
    const body = await whGet<{ data: TimeEntry[] }>("/toggl/time-entries", { from, to, category });
    return c.json(body);
  });

export default app;
