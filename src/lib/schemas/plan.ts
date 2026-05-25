import { z } from "zod";

export const planFilterSchema = z.object({
  subjectIds: z.array(z.string().uuid()).optional(),
  levelIds: z.array(z.string().uuid()).optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type PlanFilterInput = z.infer<typeof planFilterSchema>;

export const milestoneSchema = z.object({
  count: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;

export const weekdayWeightsSchema = z.array(z.number().nonnegative()).length(7);

export const planCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  daily_minutes: z.number().int().positive(),
  time_multiplier_pct: z.number().int().positive().default(100),
  weekday_weights: weekdayWeightsSchema.default([1, 1, 1, 1, 1, 1, 1]),
  filter: planFilterSchema.default({}),
  milestones: z.array(milestoneSchema).default([]),
});
export type PlanCreateInput = z.infer<typeof planCreateInputSchema>;

export const planUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  daily_minutes: z.number().int().positive().optional(),
  time_multiplier_pct: z.number().int().positive().optional(),
  weekday_weights: weekdayWeightsSchema.optional(),
  filter: planFilterSchema.optional(),
  milestones: z.array(milestoneSchema).optional(),
});
export type PlanUpdateInput = z.infer<typeof planUpdateInputSchema>;
