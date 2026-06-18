import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

/**
 * scope ごとに status の stability days を上書きするマップ。
 * key は `answer_status.id` (UUID)。name keyed だと rename で orphan になるので
 * 2026-06-18 に意味論を id keyed に切り替えた。値は days (>=0)。
 */
export const statusStabilitiesSchema = z.record(z.string(), z.number().int().nonnegative());

export const scopeCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
  daily_minutes: z.number().int().positive().default(60),
  time_multiplier_pct: z.number().int().positive().default(100),
  weekday_weights: z.array(z.number().nonnegative()).length(7).default([1, 1, 1, 1, 1, 1, 1]),
  status_stabilities: statusStabilitiesSchema.default({}),
});

export const scopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
  daily_minutes: z.number().int().positive().optional(),
  time_multiplier_pct: z.number().int().positive().optional(),
  weekday_weights: z.array(z.number().nonnegative()).length(7).optional(),
  status_stabilities: statusStabilitiesSchema.optional(),
  is_active: z.boolean().optional(),
});

export type ScopeCreateInput = z.infer<typeof scopeCreateInputSchema>;
export type ScopeUpdateInput = z.infer<typeof scopeUpdateInputSchema>;

/* ── GoalLayer / GoalMilestone batch (scope-scoped) ──────────────── */

export const scopeGoalLayerUpdateInputSchema = z.object({
  name: z.string().optional(),
  color: z.string().nullish(),
  opacity_pct: z.number().int().min(0).max(100).nullish(),
  line_style: z.enum(["solid", "dashed", "dotted"]).nullish(),
  line_width: z.number().int().min(1).max(10).nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const scopeGoalMilestoneUpdateInputSchema = z.object({
  layer_id: z.string().uuid().optional(),
  target: z.number().int().nonnegative().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});

export const scopeGoalLayerInBatchSchema = z.object({
  temp_id: z.string().min(1),
  scope_id: z.string().uuid(),
  name: z.string().default(""),
  color: z.string().nullish(),
  opacity_pct: z.number().int().min(0).max(100).nullish(),
  line_style: z.enum(["solid", "dashed", "dotted"]).nullish(),
  line_width: z.number().int().min(1).max(10).nullish(),
  sort_order: z.number().int().nonnegative().default(0),
});

export const scopeGoalMilestoneInBatchSchema = z.object({
  temp_id: z.string().min(1),
  scope_id: z.string().uuid(),
  /** UUID か、同じ batch 内の layer の temp_id。サーバ側で id_map 解決する。 */
  layer_id: z.string().min(1),
  target: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

export const scopeBatchInputSchema = z.object({
  scope_update: scopeUpdateInputSchema.nullish(),
  layer_deletes: z.array(z.string().uuid()).default([]),
  layer_creates: z.array(scopeGoalLayerInBatchSchema).default([]),
  layer_updates: z.array(z.object({
    id: z.string().uuid(),
    payload: scopeGoalLayerUpdateInputSchema,
  })).default([]),
  milestone_deletes: z.array(z.string().uuid()).default([]),
  milestone_creates: z.array(scopeGoalMilestoneInBatchSchema).default([]),
  milestone_updates: z.array(z.object({
    id: z.string().uuid(),
    payload: scopeGoalMilestoneUpdateInputSchema,
  })).default([]),
});
export type ScopeBatchInput = z.infer<typeof scopeBatchInputSchema>;
