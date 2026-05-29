import { z } from "zod";

/* ── Backlog (strategy numbers) ──────────────────────────────── */

export const backlogFilterSchema = z.object({
  subjectIds: z.array(z.string().uuid()).optional(),
  levelIds: z.array(z.string().uuid()).optional(),
});
export type BacklogFilterInput = z.infer<typeof backlogFilterSchema>;

export const weekdayWeightsSchema = z.array(z.number().nonnegative()).length(7);

export const backlogCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  daily_minutes: z.number().int().positive(),
  time_multiplier_pct: z.number().int().positive().default(100),
  weekday_weights: weekdayWeightsSchema.default([1, 1, 1, 1, 1, 1, 1]),
  filter: backlogFilterSchema.default({}),
});
export type BacklogCreateInput = z.infer<typeof backlogCreateInputSchema>;

export const backlogUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  daily_minutes: z.number().int().positive().optional(),
  time_multiplier_pct: z.number().int().positive().optional(),
  weekday_weights: weekdayWeightsSchema.optional(),
  filter: backlogFilterSchema.optional(),
});
export type BacklogUpdateInput = z.infer<typeof backlogUpdateInputSchema>;

/* ── GoalLayer (bitemporal) ──────────────────────────────────── */

export const goalLayerCreateInputSchema = z.object({
  backlog_id: z.string().uuid(),
  name: z.string().default(""),
  color: z.string().nullish(),
  opacity_pct: z.number().int().min(0).max(100).nullish(),
  line_style: z.enum(["solid", "dashed", "dotted"]).nullish(),
  line_width: z.number().int().min(1).max(10).nullish(),
  sort_order: z.number().int().nonnegative().default(0),
});
export type GoalLayerCreateInput = z.infer<typeof goalLayerCreateInputSchema>;

export const goalLayerUpdateInputSchema = z.object({
  name: z.string().optional(),
  color: z.string().nullish(),
  opacity_pct: z.number().int().min(0).max(100).nullish(),
  line_style: z.enum(["solid", "dashed", "dotted"]).nullish(),
  line_width: z.number().int().min(1).max(10).nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});
export type GoalLayerUpdateInput = z.infer<typeof goalLayerUpdateInputSchema>;

export const goalLayerReorderInputSchema = z.object({
  backlog_id: z.string().uuid(),
  layer_ids: z.array(z.string().min(1)),
});
export type GoalLayerReorderInput = z.infer<typeof goalLayerReorderInputSchema>;

/* ── GoalMilestone (bitemporal) ──────────────────────────────── */

export const goalMilestoneCreateInputSchema = z.object({
  backlog_id: z.string().uuid(),
  layer_id: z.string().uuid(),
  target: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export type GoalMilestoneCreateInput = z.infer<typeof goalMilestoneCreateInputSchema>;

export const goalMilestoneUpdateInputSchema = z.object({
  layer_id: z.string().uuid().optional(),
  target: z.number().int().nonnegative().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});
export type GoalMilestoneUpdateInput = z.infer<typeof goalMilestoneUpdateInputSchema>;

/* ── Batch save (atomic transaction) ───────────────────────────── */

export const goalLayerInBatchSchema = z.object({
  temp_id: z.string().min(1),
  backlog_id: z.string().uuid(),
  name: z.string().default(""),
  color: z.string().nullish(),
  opacity_pct: z.number().int().min(0).max(100).nullish(),
  line_style: z.enum(["solid", "dashed", "dotted"]).nullish(),
  line_width: z.number().int().min(1).max(10).nullish(),
  sort_order: z.number().int().nonnegative().default(0),
});

export const goalMilestoneInBatchSchema = z.object({
  temp_id: z.string().min(1),
  backlog_id: z.string().uuid(),
  /** UUID か、同じ batch 内の layer の temp_id。サーバ側で id_map 解決する。 */
  layer_id: z.string().min(1),
  target: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

export const backlogBatchInputSchema = z.object({
  backlog_update: backlogUpdateInputSchema.nullish(),
  layer_deletes: z.array(z.string().uuid()).default([]),
  layer_creates: z.array(goalLayerInBatchSchema).default([]),
  layer_updates: z.array(z.object({
    id: z.string().uuid(),
    payload: goalLayerUpdateInputSchema,
  })).default([]),
  milestone_deletes: z.array(z.string().uuid()).default([]),
  milestone_creates: z.array(goalMilestoneInBatchSchema).default([]),
  milestone_updates: z.array(z.object({
    id: z.string().uuid(),
    payload: goalMilestoneUpdateInputSchema,
  })).default([]),
});
export type BacklogBatchInput = z.infer<typeof backlogBatchInputSchema>;

