import { z } from "zod";

/* ── Plan (戦略数値) ─────────────────────────────────────────── */

export const planFilterSchema = z.object({
  subjectIds: z.array(z.string().uuid()).optional(),
  levelIds: z.array(z.string().uuid()).optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type PlanFilterInput = z.infer<typeof planFilterSchema>;

export const weekdayWeightsSchema = z.array(z.number().nonnegative()).length(7);

export const planCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  daily_minutes: z.number().int().positive(),
  time_multiplier_pct: z.number().int().positive().default(100),
  weekday_weights: weekdayWeightsSchema.default([1, 1, 1, 1, 1, 1, 1]),
  filter: planFilterSchema.default({}),
});
export type PlanCreateInput = z.infer<typeof planCreateInputSchema>;

export const planUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  daily_minutes: z.number().int().positive().optional(),
  time_multiplier_pct: z.number().int().positive().optional(),
  weekday_weights: weekdayWeightsSchema.optional(),
  filter: planFilterSchema.optional(),
});
export type PlanUpdateInput = z.infer<typeof planUpdateInputSchema>;

/* ── PlanLayer (bitemporal) ──────────────────────────────────── */

export const layerCreateInputSchema = z.object({
  plan_id: z.string().uuid(),
  name: z.string().default(""),
  sort_order: z.number().int().nonnegative().default(0),
});
export type LayerCreateInput = z.infer<typeof layerCreateInputSchema>;

export const layerUpdateInputSchema = z.object({
  name: z.string().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});
export type LayerUpdateInput = z.infer<typeof layerUpdateInputSchema>;

export const layerReorderInputSchema = z.object({
  plan_id: z.string().uuid(),
  /** layer id を表示順に並べた配列。layer id は不透明トークンとして扱う (UUID 検証しない) */
  layer_ids: z.array(z.string().min(1)),
});
export type LayerReorderInput = z.infer<typeof layerReorderInputSchema>;

/* ── PlanMilestone (bitemporal) ──────────────────────────────── */

export const milestoneCreateInputSchema = z.object({
  plan_id: z.string().uuid(),
  layer_id: z.string().uuid(),
  target: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export type MilestoneCreateInput = z.infer<typeof milestoneCreateInputSchema>;

export const milestoneUpdateInputSchema = z.object({
  layer_id: z.string().uuid().optional(),
  target: z.number().int().nonnegative().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateInputSchema>;
