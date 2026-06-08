/**
 * Phase 4: topic table 廃止後の stub。
 * UI/hooks (useTopicsList, useFlashcards) がまだこの endpoint を叩くため、
 * wire 互換維持のために空配列を返す。B フェーズで完全削除予定。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { masterCreateInputSchema, masterUpdateInputSchema } from "@/lib/schemas/project";
import { reorderInputSchema } from "@/lib/schemas/common";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", (c) => c.json({ data: [] as { id: string; code: string; name: string; color: string | null; sortOrder: number }[], next_cursor: null }))
  .post("/", zValidator("json", masterCreateInputSchema), (c) => c.json({ error: "topic is deprecated" }, 410))
  .patch("/reorder", zValidator("json", reorderInputSchema), (c) => c.json({ ok: false }, 410))
  .put("/:entityId", zValidator("json", masterUpdateInputSchema), (c) => c.json({ error: "topic is deprecated" }, 410))
  .delete("/:entityId", (c) => c.json({ error: "topic is deprecated" }, 410));

export default app;
